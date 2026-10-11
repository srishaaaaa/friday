"""Response pipeline.

prepare():  validate → intent detection → context retrieval (history, attachments, memories)
            → instruction assembly → routing → persist the user turn
run():      stream from the routed provider (one same-provider retry if enabled) → persist → done
No stage silently switches provider: a failed request is reported, never re-sent elsewhere.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator, Callable

from app.core.config import Settings
from app.core.errors import AppError
from app.database.repository import Repository
from app.providers.base import ChatMessage, Provider, ProviderError, ToolCall
from app.providers.registry import ProviderRegistry
from app.schemas.api import AppSettings, ChatRequest
from app.services.attachments import as_prompt_block
from app.services.prompting import Persona, build_system_prompt, detect_intent
from app.services.routing_service import RouteDecision, decide_route
from app.services.tools import TOOL_TIMEOUT, TOOLS, Tool, ToolContext, ToolResult, available_tools

log = logging.getLogger("friday.chat")
MEMORY_CHAR_BUDGET = 4000
NO_TEXT_PROMPT = "Please review the attached file(s)."
MAX_TOOL_STEPS = 6          # tool rounds per reply before the model must answer
APPROVAL_TIMEOUT = 300.0    # seconds to wait for the user to allow/deny an action
TOOL_RESULT_CHARS = 14_000  # cap on what one tool result adds to the context


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def memory_block(items: list[str]) -> str:
    lines, used = [], 0
    for c in items:
        if used + len(c) > MEMORY_CHAR_BUDGET:
            break
        lines.append(f"- {c}")
        used += len(c)
    if not lines:
        return ""
    return ("Things the user has asked you to remember (use when relevant; do not repeat them unprompted):\n"
            + "\n".join(lines))


async def iter_with_cancel(source: AsyncIterator, cancel: asyncio.Event) -> AsyncIterator:
    """Yield from `source` until exhausted or `cancel` is set (interrupts a pending wait)."""
    it = source.__aiter__()
    waiter = asyncio.ensure_future(cancel.wait())
    try:
        while True:
            nxt = asyncio.ensure_future(it.__anext__())
            done, _ = await asyncio.wait({nxt, waiter}, return_when=asyncio.FIRST_COMPLETED)
            if nxt not in done:
                nxt.cancel()
                with contextlib.suppress(BaseException):
                    await nxt
                return
            try:
                item = nxt.result()
            except StopAsyncIteration:
                return
            yield item
    finally:
        waiter.cancel()
        aclose = getattr(it, "aclose", None)
        if aclose:
            with contextlib.suppress(BaseException):
                await aclose()


@dataclass
class Prepared:
    request_id: str
    conversation_id: str
    route: RouteDecision
    provider: Provider
    history: list[ChatMessage]
    prefs: AppSettings
    cancel: asyncio.Event
    system: str | None = None
    intent: str = "general"
    context_dropped: int = 0
    activity: list[str] = field(default_factory=list)
    tools: list[Tool] = field(default_factory=list)
    tool_ctx: ToolContext | None = None


def generation_options(prefs: AppSettings) -> dict:
    """Provider-agnostic sampling options; each adapter maps (or ignores) what it supports."""
    opts: dict = {"timeout": float(prefs.request_timeout)}
    if prefs.temperature is not None:
        opts["temperature"] = prefs.temperature
    if prefs.top_p is not None:
        opts["top_p"] = prefs.top_p
    if prefs.context_window is not None:
        opts["num_ctx"] = prefs.context_window
    return opts


class ChatService:
    def __init__(self, settings: Settings, repo: Repository, registry: ProviderRegistry,
                 get_secret: Callable[[str], str | None] | None = None, files_dir: Path | None = None):
        self.settings, self.repo, self.registry = settings, repo, registry
        self._get_secret = get_secret or (lambda _k: None)
        self.files_dir = files_dir or (Path.home() / "Documents" / "FRIDAY")
        self._active: dict[str, asyncio.Event] = {}
        self._approvals: dict[tuple[str, str], asyncio.Future] = {}

    def cancel(self, request_id: str) -> bool:
        ev = self._active.get(request_id)
        if ev:
            ev.set()
        return ev is not None

    # ------------------------------------------------------------------ prepare
    def prepare(self, req: ChatRequest) -> Prepared:
        prefs = self.repo.get_settings()
        text = (req.message or "").strip()
        new_atts = self.repo.get_attachments(req.attachment_ids)
        if len(new_atts) != len(set(req.attachment_ids)):
            raise AppError(404, "attachment_not_found", "An attachment was not found. Remove it and attach again.")
        if any(a.message_id for a in new_atts):
            raise AppError(409, "attachment_used", "An attachment was already sent with another message.")
        if req.regenerate and req.edit:
            raise AppError(422, "bad_request", "Choose either regenerate or edit.")
        if not req.regenerate:
            if not text and not new_atts:
                raise AppError(422, "empty_message", "Message is empty.")
            if len(text) > self.settings.max_message_chars:
                raise AppError(413, "message_too_large", "Message exceeds the maximum length.")
        if req.request_id in self._active:
            raise AppError(409, "duplicate_request", "A request with this id is already running.")

        conv = self.repo.get_conversation(req.conversation_id) if req.conversation_id else None
        if req.conversation_id and not conv:
            raise AppError(404, "conversation_not_found", "Conversation not found.")
        if req.regenerate:
            if not conv or not conv.messages:
                raise AppError(422, "nothing_to_regenerate", "There is nothing to regenerate.")
            text = next((m.content for m in reversed(conv.messages) if m.role == "user"), "")
        if req.edit:
            if not conv or not any(m.role == "user" for m in conv.messages):
                raise AppError(422, "nothing_to_edit", "There is no message to edit.")
            if new_atts:
                raise AppError(422, "bad_request", "Attachments cannot be added while editing a message.")

        # Stage: intent detection (deterministic, local).
        intent = detect_intent(text)
        # Anything derived from an attached file is private: it stays on-device unless the user approves.
        has_files = bool(new_atts) or bool(conv and any(m.attachments for m in conv.messages))

        # Stage: routing — before any database mutation, so a rejected request leaves no trace.
        mode = req.mode or prefs.default_mode
        hosted = self.registry.get(prefs.hosted_provider)
        route = decide_route(mode=mode, prefs=prefs, text=text,
                             cloud_configured=bool(hosted and hosted.configured),
                             model_override=req.model, private_context=req.private_context or has_files,
                             confirm_cloud=req.confirm_cloud)
        provider = self.registry.get(route.provider_id)
        if provider is None:
            raise AppError(500, "provider_missing", f"Provider '{route.provider_id}' is not registered.")

        # Stage: persist the user turn.
        if conv is None:
            title = text[:60].replace("\n", " ") or (new_atts[0].name[:60] if new_atts else "") or "New conversation"
            conv = self.repo.create_conversation(title)
        if req.regenerate:
            if conv.messages[-1].role == "assistant":
                self.repo.delete_message(conv.messages[-1].id)
        elif req.edit:
            self.repo.edit_last_user_message(conv.id, text)
        else:
            self.repo.add_message(conv.id, "user", text, attachment_ids=[a.id for a in new_atts])

        # Stage: context retrieval.
        stored = self.repo.get_conversation(conv.id)
        turns = [m for m in stored.messages  # type: ignore[union-attr]
                 if m.role in ("user", "assistant") and (m.content or m.attachments)]
        if not prefs.conversation_memory:  # only the newest user turn
            turns = turns[-1:]
        all_msgs = [self._to_chat(m) for m in turns]
        history = self._fit(all_msgs)
        dropped = len(all_msgs) - len(history)

        activity: list[str] = []
        files = [a for m in turns for a in m.attachments]
        if files:
            activity.append(f"Reading {len(files)} attached file{'s' if len(files) != 1 else ''}")
        memories: list[str] = []
        if prefs.memory_enabled:
            memories = [m.content for m in self.repo.list_memories(only_enabled=True)]
            if memories:
                activity.append(f"Using {len(memories)} saved memor{'ies' if len(memories) != 1 else 'y'}")
        if dropped:
            activity.append(f"{dropped} earlier message{'s' if dropped != 1 else ''} outside the context window")

        # Stage: tools offered for this request.
        tool_ctx = ToolContext(private=req.private_context or has_files, web_enabled=prefs.web_search,
                               allow_commands=prefs.allow_commands, search_provider=prefs.search_provider,
                               get_search_key=lambda: self._get_secret("ollama_api_key"), files_dir=self.files_dir)
        offered = available_tools(tool_ctx) if prefs.tools_enabled else []

        # Stage: instruction assembly.
        persona = Persona(prefs.personality, prefs.warmth, prefs.humor, prefs.detail, prefs.tech_depth,
                          prefs.formatting, prefs.suggestions, prefs.nickname, prefs.custom_instructions)
        system = build_system_prompt(prefs.system_prompt, persona, intent, memory_block(memories),
                                     tools=[t.name for t in offered])

        cancel = asyncio.Event()
        self._active[req.request_id] = cancel
        return Prepared(req.request_id, conv.id, route, provider, history, prefs, cancel, system or None,
                        intent, dropped, activity, offered, tool_ctx)

    @staticmethod
    def _to_chat(m) -> ChatMessage:  # noqa: ANN001
        """A stored message as the model sees it: attached documents inline, images as vision inputs (+ OCR text)."""
        docs = [as_prompt_block(a.name, a.text or "", a.pages, a.truncated, bool(a.ocr))
                for a in m.attachments if a.kind == "text" or (a.kind == "image" and a.text)]
        images = [(a.mime, a.data_b64) for a in m.attachments if a.kind == "image" and a.data_b64]
        content = m.content or (NO_TEXT_PROMPT if m.attachments else "")
        if docs:
            content = "\n\n".join([*docs, content])
        return ChatMessage(m.role, content, images)

    def _fit(self, msgs: list[ChatMessage]) -> list[ChatMessage]:
        budget, kept = self.settings.context_char_budget, []
        for m in reversed(msgs):
            if kept and budget - len(m.content) < 0:
                break
            budget -= len(m.content)
            kept.append(m)
        kept.reverse()
        while kept and kept[0].role != "user":  # providers require the first turn to be a user turn
            kept.pop(0)
        return kept

    # ---------------------------------------------------------------- approvals
    def approve(self, request_id: str, call_id: str, approved: bool) -> bool:
        fut = self._approvals.get((request_id, call_id))
        if not fut or fut.done():
            return False
        fut.set_result(approved)
        return True

    async def _wait_approval(self, p: Prepared, call_id: str) -> bool:
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._approvals[(p.request_id, call_id)] = fut
        cancel = asyncio.ensure_future(p.cancel.wait())
        try:
            done, _ = await asyncio.wait({fut, cancel}, timeout=APPROVAL_TIMEOUT, return_when=asyncio.FIRST_COMPLETED)
            return fut in done and bool(fut.result())
        finally:
            cancel.cancel()
            self._approvals.pop((p.request_id, call_id), None)

    # ---------------------------------------------------------------------- run
    async def run(self, p: Prepared) -> AsyncIterator[str]:
        buf: list[str] = []
        usage: dict = {}
        status, error = "ok", None
        tool_log: list[dict] = []
        sources: list[dict] = []
        yield sse("meta", {"conversation_id": p.conversation_id, "provider": p.route.provider_id,
                           "model": p.route.model, "mode": p.route.mode, "category": p.route.category,
                           "reason": p.route.reason, "leaves_device": p.route.leaves_device,
                           "intent": p.intent, "context_dropped": p.context_dropped, "activity": p.activity})
        opts = generation_options(p.prefs)
        history = list(p.history)
        offered = list(p.tools)
        try:
            for step in range(MAX_TOOL_STEPS + 1):
                calls: list[ToolCall] = []
                step_text: list[str] = []
                schemas = [t.schema() for t in offered] if offered and step < MAX_TOOL_STEPS else None
                attempts, attempt = (2 if p.prefs.auto_retry else 1), 0
                while True:
                    try:
                        source = p.provider.stream(history, p.route.model, p.system, p.prefs.max_tokens,
                                                   options=opts, tools=schemas)
                        async for chunk in iter_with_cancel(source, p.cancel):
                            if chunk.kind == "delta":
                                buf.append(chunk.text)
                                step_text.append(chunk.text)
                                yield sse("delta", {"text": chunk.text})
                            elif chunk.kind == "tool_call" and chunk.call:
                                calls.append(chunk.call)
                            else:
                                usage = chunk.usage
                        break
                    except ProviderError as exc:
                        if exc.code == "tools_unsupported" and schemas:
                            # The model can't use tools: answer without them and say so.
                            offered, schemas = [], None
                            yield sse("status", {"text": f"{p.route.model} can't use tools — answering without them"})
                            continue
                        # Same provider, once, and only if nothing was streamed yet (no duplicated text).
                        if exc.retryable and not step_text and attempt + 1 < attempts and not p.cancel.is_set():
                            attempt += 1
                            yield sse("status", {"text": "Retrying after a temporary error…"})
                            await asyncio.sleep(1.0)
                            continue
                        raise
                if not calls or p.cancel.is_set():
                    break

                history.append(ChatMessage("assistant", "".join(step_text), tool_calls=calls))
                for call in calls:
                    async for ev in self._run_tool(p, call, history, tool_log, sources):
                        yield ev
                    if p.cancel.is_set():
                        break
                if p.cancel.is_set():
                    break
                if buf and not buf[-1].endswith("\n"):
                    buf.append("\n\n")  # keep pre-tool narration and the final answer as separate paragraphs
                    yield sse("delta", {"text": "\n\n"})

            content_now = "".join(buf).strip()
            if p.cancel.is_set():
                status = "cancelled"
            elif not content_now:
                status = "error"
                error = {"code": "empty_response", "message": "The model returned an empty response.",
                         "retryable": True}
        except ProviderError as exc:
            status = "error"
            error = {"code": exc.code, "message": exc.message, "retryable": exc.retryable}
        except asyncio.CancelledError:  # client disconnected
            self._persist(p, "".join(buf).strip(), "cancelled", usage, tool_log, sources)
            self._active.pop(p.request_id, None)
            raise
        except Exception as exc:  # noqa: BLE001
            log.error("unexpected chat failure", extra={"ctx": {"error": type(exc).__name__}})
            status = "error"
            error = {"code": "internal_error", "message": "Unexpected error while generating.", "retryable": True}

        content = "".join(buf).strip()
        msg = self._persist(p, content, status, usage, tool_log, sources) if (content or status == "cancelled") else None
        self._active.pop(p.request_id, None)
        if error:
            yield sse("error", error)
        yield sse("done", {"status": status, "message_id": msg.id if msg else None, "usage": usage,
                           "conversation_id": p.conversation_id})

    async def _run_tool(self, p: Prepared, call: ToolCall, history: list[ChatMessage],
                        tool_log: list[dict], sources: list[dict]) -> AsyncIterator[str]:
        tool = TOOLS.get(call.name)
        offered = {t.name for t in p.tools}
        detail = tool.describe(call.arguments)[:300] if tool else ""
        entry = {"id": call.id, "name": call.name, "label": tool.label if tool else call.name, "detail": detail}
        if not tool or call.name not in offered:
            result = ToolResult(f"Error: tool '{call.name}' is not available.", "Tool not available", ok=False)
        else:
            approved = True
            if tool.needs_approval(call.arguments, p.tool_ctx):
                entry["approval"] = "pending"
                yield sse("tool_request", {**entry, "args": call.arguments,
                                           "private": p.tool_ctx.private if p.tool_ctx else False})
                approved = await self._wait_approval(p, call.id)
                entry["approval"] = "approved" if approved else "declined"
            if not approved:
                result = ToolResult("The user declined this action. Do not retry it; continue without it.",
                                    "Declined by you", ok=False)
            else:
                yield sse("tool_start", entry)
                try:
                    result = await asyncio.wait_for(tool.run(call.arguments, p.tool_ctx), TOOL_TIMEOUT)  # type: ignore[arg-type]
                except asyncio.TimeoutError:
                    result = ToolResult("Error: the tool timed out.", "Timed out", ok=False)
                except Exception as exc:  # noqa: BLE001 - a tool bug must not end the conversation
                    log.error("tool failed", extra={"ctx": {"tool": call.name, "error": type(exc).__name__}})
                    result = ToolResult(f"Error: {type(exc).__name__}", "Tool failed", ok=False)
        # Number sources across the whole reply so [n] citations stay unique.
        new_sources = []
        for s in result.sources:
            if not any(x["url"] == s["url"] for x in sources):
                sources.append({**s, "n": len(sources) + 1})
                new_sources.append(sources[-1])
        entry.update(ok=result.ok, summary=result.summary)
        tool_log.append(entry)
        yield sse("tool_result", {**entry, "sources": new_sources})
        history.append(ChatMessage("tool", result.content[:TOOL_RESULT_CHARS], tool_call_id=call.id, tool_name=call.name))

    def _persist(self, p: Prepared, content: str, status: str, usage: dict,
                 tool_log: list[dict] | None = None, sources: list[dict] | None = None):
        if not content:
            return None
        tools = {"tools": tool_log, "sources": sources} if (tool_log or sources) else None
        return self.repo.add_message(p.conversation_id, "assistant", content, status=status,
                                     provider=p.route.provider_id, model=p.route.model,
                                     route_reason=p.route.reason, usage=usage or None, tools=tools)  # type: ignore[arg-type]
