from __future__ import annotations

import json
import uuid
from typing import AsyncIterator

import httpx

from app.services.tools import parse_args

from .base import ChatMessage, ModelInfo, Provider, ProviderError, ProviderStatus, StreamChunk, ToolCall


class OllamaProvider(Provider):
    id = "ollama"
    display_name = "Ollama (local)"
    is_local = True

    def __init__(self, base_url: str, timeout: float = 120.0, transport: httpx.AsyncBaseTransport | None = None):
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._transport = transport

    @property
    def configured(self) -> bool:
        return True

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base, transport=self._transport,
                                 timeout=httpx.Timeout(timeout or self._timeout, connect=3.0))

    async def status(self) -> ProviderStatus:
        try:
            models = await self.list_models()
        except ProviderError as exc:
            return ProviderStatus(self.id, self.display_name, True, True, False, exc.message)
        detail = f"{len(models)} model(s) installed" if models else "Running, but no models installed"
        return ProviderStatus(self.id, self.display_name, True, True, True, detail)

    async def list_models(self) -> list[ModelInfo]:
        try:
            async with self._client(5.0) as c:
                r = await c.get("/api/tags")
            r.raise_for_status()
            return [self._model_info(m) for m in r.json().get("models", [])]
        except (httpx.ConnectError, httpx.ConnectTimeout):
            raise ProviderError("provider_unavailable",
                                "Ollama is not reachable. Install it from ollama.com and make sure it is running.",
                                retryable=True) from None
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise ProviderError("provider_error", f"Unexpected response from Ollama ({type(exc).__name__}).") from None

    def _model_info(self, m: dict) -> ModelInfo:
        """One entry of /api/tags, exactly as installed — the id is the model's own name, never rewritten."""
        d = m.get("details") or {}
        caps = m.get("capabilities")
        name = m["name"]
        remote = bool(m.get("remote_host")) or name.lower().endswith(("-cloud", ":cloud"))
        return ModelInfo(
            id=name, name=name, provider=self.id,
            supports_vision=("vision" in caps) if isinstance(caps, list) else None,
            context_length=d.get("context_length") or m.get("context_length"),
            size=m.get("size"), family=d.get("family") or None, parameter_size=d.get("parameter_size") or None,
            quantization=d.get("quantization_level") or None, capabilities=caps if isinstance(caps, list) else None,
            remote=remote, remote_model=m.get("remote_model"), modified_at=m.get("modified_at"))

    @staticmethod
    def _msg(m: ChatMessage) -> dict:
        if m.role == "tool":
            return {"role": "tool", "tool_name": m.tool_name or "", "content": m.content}
        d: dict = {"role": m.role, "content": m.content}
        if m.images:
            d["images"] = [b64 for _, b64 in m.images]
        if m.tool_calls:
            d["tool_calls"] = [{"function": {"name": c.name, "arguments": c.arguments}} for c in m.tool_calls]
        return d

    @staticmethod
    def auto_num_ctx(chars: int, max_tokens: int) -> int:
        """Ollama's default context is small; size it to the prompt (~3.5 chars/token) + reply, power of two."""
        need = int(chars / 3.5) + max_tokens + 256
        ctx = 4096
        while ctx < need and ctx < 32768:
            ctx *= 2
        return ctx

    async def stream(self, messages: list[ChatMessage], model: str, system: str | None,
                     max_tokens: int, options: dict | None = None, tools: list[dict] | None = None) -> AsyncIterator[StreamChunk]:
        opts = options or {}
        msgs = ([{"role": "system", "content": system}] if system else []) + [self._msg(m) for m in messages]
        chars = len(system or "") + sum(len(m.content) for m in messages)
        o: dict = {"num_predict": max_tokens, "num_ctx": opts.get("num_ctx") or self.auto_num_ctx(chars, max_tokens)}
        for k in ("temperature", "top_p"):
            if opts.get(k) is not None:
                o[k] = opts[k]
        body: dict = {"model": model, "messages": msgs, "stream": True, "options": o}
        thought = answered = False  # reasoning seen / visible answer (or tool call) seen
        if opts.get("think") is not None:  # only sent for models that report the "thinking" capability
            body["think"] = bool(opts["think"])
        if tools:
            body["tools"] = [{"type": "function", "function": t} for t in tools]
        try:
            async with self._client(opts.get("timeout")) as c, c.stream("POST", "/api/chat", json=body) as r:
                if r.status_code != 200:
                    raw = (await r.aread()).decode("utf-8", "replace")
                    if tools and "does not support tools" in raw:
                        raise ProviderError("tools_unsupported", f"'{model}' can't use tools.", status=r.status_code)
                    if r.status_code == 404:
                        raise ProviderError("model_not_found",
                                            f"Model '{model}' is not installed. Run: ollama pull {model}", status=404)
                    raise ProviderError("provider_error", f"Ollama returned HTTP {r.status_code}: {raw[:200]}",
                                        retryable=r.status_code >= 500, status=r.status_code)
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except ValueError:
                        raise ProviderError("bad_response", "Ollama sent a malformed stream chunk.") from None
                    if "error" in obj:
                        raise ProviderError("provider_error", str(obj["error"])[:300])
                    msg = obj.get("message") or {}
                    text = msg.get("content", "")  # "thinking" is deliberately not forwarded (hidden reasoning)
                    if msg.get("thinking"):
                        thought = True
                    if text:
                        answered = True
                        yield StreamChunk("delta", text)
                    for tc in msg.get("tool_calls") or []:
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            yield StreamChunk("tool_call", call=ToolCall(tc.get("id") or f"call_{uuid.uuid4().hex[:10]}",
                                                                         fn["name"], parse_args(fn.get("arguments"))))
                    if msg.get("tool_calls"):
                        answered = True
                    if obj.get("done"):
                        if thought and not answered and obj.get("done_reason") == "length":
                            raise ProviderError("reasoning_budget",
                                                f"'{model}' used its whole response budget ({max_tokens} tokens) reasoning before it could "
                                                "answer. Raise Settings → Generation → Maximum response length.")
                        yield StreamChunk("usage", usage={"input_tokens": obj.get("prompt_eval_count"),
                                                          "output_tokens": obj.get("eval_count")})
                        return
        except (httpx.ConnectError, httpx.ConnectTimeout):
            raise ProviderError("provider_unavailable", "Ollama is not reachable. Is it running?",
                                retryable=True) from None
        except httpx.ReadTimeout:
            raise ProviderError("timeout", "Ollama took too long to respond.", retryable=True) from None
        except httpx.HTTPError as exc:
            raise ProviderError("network_error", f"Network error talking to Ollama ({type(exc).__name__}).",
                                retryable=True) from None
