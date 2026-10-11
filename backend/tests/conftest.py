from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.core.config import Settings
from app.core.security import MemorySecretStore
from app.main import create_app
from app.providers.base import ChatMessage, ModelInfo, Provider, ProviderError, ProviderStatus, StreamChunk
from app.providers.registry import ProviderRegistry

TOKEN = "test-token-123"
HEADERS = {"x-friday-token": TOKEN}


class FakeProvider(Provider):
    def __init__(self, pid: str, local: bool, *, chunks=("Hello", " world"), error: ProviderError | None = None,
                 hang_after_first: bool = False, configured: bool = True):
        self.id, self.display_name, self.is_local = pid, pid, local
        self.chunks, self.error, self.hang, self._configured = list(chunks), error, hang_after_first, configured
        self.calls: list[tuple[list[ChatMessage], str]] = []

    @property
    def configured(self) -> bool:
        return self._configured

    async def status(self):
        return ProviderStatus(self.id, self.display_name, self.is_local, self._configured, True, "ok")

    async def list_models(self):
        return [ModelInfo("m1", "m1", self.id)]

    async def stream(self, messages, model, system, max_tokens, options=None, tools=None):
        self.calls.append((list(messages), model))
        self.last_system, self.last_options, self.last_tools = system, options, tools
        script = getattr(self, "script", None)
        if script:  # list of steps: ("calls", [ToolCall, ...]) | ("text", [chunk, ...]) | ("error", ProviderError)
            kind, payload = script.pop(0)
            if kind == "error":
                raise payload
            for item in payload:
                yield StreamChunk("tool_call", call=item) if kind == "calls" else StreamChunk("delta", item)
            yield StreamChunk("usage", usage={})
            return
        if self.error:
            raise self.error
        for i, c in enumerate(self.chunks):
            yield StreamChunk("delta", c)
            if self.hang and i == 0:
                await asyncio.sleep(30)
        yield StreamChunk("usage", usage={"input_tokens": 3, "output_tokens": 2})


@pytest.fixture
def providers():
    return {"ollama": FakeProvider("ollama", True), "anthropic": FakeProvider("anthropic", False)}


@pytest.fixture
def make_app(tmp_path, providers):
    def _make(data_dir=None):
        s = Settings(data_dir=data_dir or tmp_path, token=TOKEN)
        return create_app(s, secret_store=MemorySecretStore(),
                          registry=ProviderRegistry(list(providers.values())))
    return _make


@pytest.fixture
def app(make_app):
    return make_app()


@pytest.fixture
async def client(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t", headers=HEADERS) as c:
        yield c


def parse_sse(text: str) -> list[tuple[str, dict]]:
    out = []
    for block in text.strip().split("\n\n"):
        ev, data = "", ""
        for line in block.splitlines():
            if line.startswith("event: "):
                ev = line[7:]
            elif line.startswith("data: "):
                data = line[6:]
        if ev:
            out.append((ev, json.loads(data)))
    return out
