from __future__ import annotations

import json
from typing import AsyncIterator, Callable

import httpx

from app.services.tools import parse_args

from .base import ChatMessage, ModelInfo, Provider, ProviderError, ProviderStatus, StreamChunk, ToolCall

API_VERSION = "2023-06-01"


class AnthropicProvider(Provider):
    """Hosted provider adapter (Anthropic Messages API, streaming)."""

    id = "anthropic"
    display_name = "Anthropic (cloud)"
    is_local = False

    def __init__(self, base_url: str, get_key: Callable[[], str | None], timeout: float = 120.0,
                 transport: httpx.AsyncBaseTransport | None = None):
        self._base = base_url.rstrip("/")
        self._get_key = get_key
        self._timeout = timeout
        self._transport = transport

    @property
    def configured(self) -> bool:
        return bool(self._get_key())

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        key = self._get_key()
        if not key:
            raise ProviderError("not_configured", "No Anthropic API key is configured. Add one in Settings.")
        return httpx.AsyncClient(
            base_url=self._base, transport=self._transport,
            headers={"x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json"},
            timeout=httpx.Timeout(timeout or self._timeout, connect=10.0))

    @staticmethod
    def _error_from(status: int, raw: str) -> ProviderError:
        message = ""
        try:
            message = json.loads(raw).get("error", {}).get("message", "")
        except ValueError:
            pass
        low = message.lower()
        if status in (401, 403):
            return ProviderError("auth_error", "The API key was rejected. Check it in Settings.", status=status)
        if status == 429:
            return ProviderError("rate_limited", "Rate limit reached. Wait a moment and retry.",
                                 retryable=True, status=status)
        if status == 400 and ("too long" in low or "context" in low or "too many tokens" in low):
            return ProviderError("context_length", "The conversation is too long for this model.", status=status)
        if status == 404:
            return ProviderError("model_not_found", message or "Model not found for this account.", status=status)
        if status in (500, 502, 503, 504, 529):
            return ProviderError("provider_error", "The provider is temporarily unavailable.",
                                 retryable=True, status=status)
        return ProviderError("provider_error", (message or f"HTTP {status}")[:300], status=status)

    async def status(self) -> ProviderStatus:
        if not self.configured:
            return ProviderStatus(self.id, self.display_name, False, False, False, "No API key configured")
        try:
            await self.list_models()
        except ProviderError as exc:
            return ProviderStatus(self.id, self.display_name, False, True, False, exc.message)
        return ProviderStatus(self.id, self.display_name, False, True, True, "Key accepted")

    async def list_models(self) -> list[ModelInfo]:
        try:
            async with self._client(10.0) as c:
                r = await c.get("/v1/models", params={"limit": 100})
        except httpx.HTTPError as exc:
            raise ProviderError("network_error", f"Could not reach the provider ({type(exc).__name__}).",
                                retryable=True) from None
        if r.status_code != 200:
            raise self._error_from(r.status_code, r.text)
        return [ModelInfo(m["id"], m.get("display_name", m["id"]), self.id) for m in r.json().get("data", [])]

    @staticmethod
    def _content(m: ChatMessage):  # noqa: ANN205
        if not m.images:
            return m.content
        blocks: list[dict] = [{"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
                              for mime, b64 in m.images]
        return [*blocks, {"type": "text", "text": m.content}]

    @classmethod
    def _messages(cls, messages: list[ChatMessage]) -> list[dict]:
        """Anthropic shape: tool calls are tool_use blocks; consecutive tool results share one user turn."""
        out: list[dict] = []
        for m in messages:
            if m.role == "tool":
                block = {"type": "tool_result", "tool_use_id": m.tool_call_id or "", "content": m.content}
                if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list) \
                        and all(b.get("type") == "tool_result" for b in out[-1]["content"]):
                    out[-1]["content"].append(block)
                else:
                    out.append({"role": "user", "content": [block]})
            elif m.tool_calls:
                blocks: list[dict] = [{"type": "text", "text": m.content}] if m.content.strip() else []
                blocks += [{"type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments} for c in m.tool_calls]
                out.append({"role": "assistant", "content": blocks})
            else:
                out.append({"role": m.role, "content": cls._content(m)})
        return out

    async def stream(self, messages: list[ChatMessage], model: str, system: str | None,
                     max_tokens: int, options: dict | None = None, tools: list[dict] | None = None) -> AsyncIterator[StreamChunk]:
        opts = options or {}
        body: dict = {"model": model, "max_tokens": max_tokens, "stream": True, "messages": self._messages(messages)}
        if system:
            body["system"] = system
        if tools:
            body["tools"] = [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]} for t in tools]
        pending: dict | None = None  # tool_use block being streamed: {id, name, json}
        # Some models accept only one of temperature / top_p; send temperature when both are set.
        if opts.get("temperature") is not None:
            body["temperature"] = min(1.0, float(opts["temperature"]))  # Anthropic's range is 0-1
        elif opts.get("top_p") is not None:
            body["top_p"] = opts["top_p"]
        usage: dict = {}
        try:
            async with self._client(opts.get("timeout")) as c, c.stream("POST", "/v1/messages", json=body) as r:
                if r.status_code != 200:
                    raise self._error_from(r.status_code, (await r.aread()).decode("utf-8", "replace"))
                event = ""
                async for line in r.aiter_lines():
                    if line.startswith("event:"):
                        event = line[6:].strip()
                        continue
                    if not line.startswith("data:"):
                        continue
                    try:
                        data = json.loads(line[5:].strip())
                    except ValueError:
                        raise ProviderError("bad_response", "Malformed stream data from provider.") from None
                    kind = data.get("type", event)
                    if kind == "message_start":
                        usage["input_tokens"] = data.get("message", {}).get("usage", {}).get("input_tokens")
                    elif kind == "content_block_start":
                        block = data.get("content_block", {})
                        if block.get("type") == "tool_use":
                            pending = {"id": block.get("id", ""), "name": block.get("name", ""), "json": ""}
                    elif kind == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "text_delta" and delta.get("text"):
                            yield StreamChunk("delta", delta["text"])
                        elif delta.get("type") == "input_json_delta" and pending is not None:
                            pending["json"] += delta.get("partial_json", "")
                    elif kind == "content_block_stop" and pending is not None:
                        yield StreamChunk("tool_call", call=ToolCall(pending["id"], pending["name"], parse_args(pending["json"])))
                        pending = None
                    elif kind == "message_delta":
                        usage["output_tokens"] = data.get("usage", {}).get("output_tokens")
                    elif kind == "error":
                        err = data.get("error", {})
                        retry = err.get("type") in ("overloaded_error", "api_error")
                        raise ProviderError("provider_error", err.get("message", "Provider stream error.")[:300],
                                            retryable=retry)
                    elif kind == "message_stop":
                        break
            yield StreamChunk("usage", usage=usage)
        except httpx.ConnectError:
            raise ProviderError("network_error", "Could not connect to the provider. Check your internet.",
                                retryable=True) from None
        except httpx.TimeoutException:
            raise ProviderError("timeout", "The provider timed out.", retryable=True) from None
        except httpx.HTTPError as exc:
            raise ProviderError("network_error", f"Network error ({type(exc).__name__}).", retryable=True) from None
