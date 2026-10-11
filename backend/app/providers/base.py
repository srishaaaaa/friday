from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Literal


class ProviderError(Exception):
    """Normalised provider failure. `code` is stable and shown to the UI."""

    def __init__(self, code: str, message: str, *, retryable: bool = False, status: int | None = None):
        super().__init__(message)
        self.code, self.message, self.retryable, self.status = code, message, retryable, status


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class ChatMessage:
    role: Literal["user", "assistant", "tool"]
    content: str
    images: list[tuple[str, str]] = field(default_factory=list)  # (mime, base64) for vision models
    tool_calls: list[ToolCall] = field(default_factory=list)    # assistant turn that requested tools
    tool_call_id: str | None = None                              # role == "tool": which call this answers
    tool_name: str | None = None


@dataclass
class StreamChunk:
    kind: Literal["delta", "usage", "tool_call"]
    text: str = ""
    usage: dict = field(default_factory=dict)
    call: ToolCall | None = None


@dataclass
class ModelInfo:
    id: str
    name: str
    provider: str
    supports_vision: bool | None = None
    context_length: int | None = None
    # Discovered metadata (Ollama /api/tags); None when the provider doesn't report it.
    size: int | None = None                 # bytes on disk (cloud models are tiny stubs)
    family: str | None = None
    parameter_size: str | None = None
    quantization: str | None = None
    capabilities: list[str] | None = None   # e.g. completion, tools, vision, thinking, embedding
    remote: bool = False                    # runs on a remote host (Ollama cloud), not this device
    remote_model: str | None = None
    modified_at: str | None = None

    @property
    def can_chat(self) -> bool:
        return self.capabilities is None or "completion" in self.capabilities


@dataclass
class ProviderStatus:
    id: str
    name: str
    local: bool
    configured: bool
    available: bool
    detail: str = ""


class Provider(ABC):
    id: str
    display_name: str
    is_local: bool

    @property
    @abstractmethod
    def configured(self) -> bool:
        """True when the provider has what it needs (e.g. an API key) to be attempted."""

    @abstractmethod
    async def status(self) -> ProviderStatus: ...

    @abstractmethod
    async def list_models(self) -> list[ModelInfo]: ...

    @abstractmethod
    def stream(self, messages: list[ChatMessage], model: str, system: str | None,
               max_tokens: int, options: dict | None = None, tools: list[dict] | None = None) -> AsyncIterator[StreamChunk]:
        """Yield text deltas, tool calls (when `tools` are offered) and finally a usage chunk.

        `tools` items are {name, description, parameters (JSON schema)}. A model that cannot use tools must raise
        ProviderError("tools_unsupported") before yielding anything. Cancelled via task cancellation.

        `options` may hold temperature, top_p, num_ctx (Ollama only) and timeout; adapters ignore what
        their API does not support.
        """
