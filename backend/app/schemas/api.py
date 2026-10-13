from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.services.prompting import DEFAULT_SYSTEM_PROMPT

Mode = Literal["local", "cloud", "smart"]


Personality = Literal["friendly", "professional", "witty", "calm", "technical", "concise", "custom"]
Level3 = Literal["low", "medium", "high"]
Humor = Literal["off", "subtle", "playful"]
Detail = Literal["brief", "balanced", "detailed", "very_detailed"]
Depth = Literal["beginner", "intermediate", "advanced", "adaptive"]
Formatting = Literal["minimal", "standard", "rich"]
Suggest = Literal["off", "occasional", "frequent"]


class AppSettings(BaseModel):
    default_mode: Mode = "smart"
    cloud_enabled: bool = True
    hosted_provider: Literal["anthropic"] = "anthropic"
    hosted_model: str = Field("claude-sonnet-5-5", max_length=128)
    ollama_model: str = Field("", max_length=128)
    system_prompt: str = Field(DEFAULT_SYSTEM_PROMPT, max_length=4000)
    max_tokens: int = Field(4096, ge=64, le=32000)
    theme: Literal["dark", "light"] = "dark"
    # memory
    memory_enabled: bool = True            # long-term (saved) memories
    conversation_memory: bool = True       # earlier turns of the current conversation
    # personality — assembled into the system prompt (services/prompting.py)
    personality: Personality = "friendly"
    warmth: Level3 = "medium"
    humor: Humor = "subtle"
    detail: Detail = "balanced"
    tech_depth: Depth = "adaptive"
    formatting: Formatting = "standard"
    suggestions: Suggest = "occasional"
    nickname: str = Field("", max_length=60)
    custom_instructions: str = Field("", max_length=2000)
    # generation — None means "use the model's own default"
    temperature: float | None = Field(None, ge=0, le=2)
    top_p: float | None = Field(None, gt=0, le=1)
    context_window: int | None = Field(None, ge=2048, le=262144)  # Ollama num_ctx; None = sized automatically
    request_timeout: int = Field(120, ge=10, le=900)
    auto_retry: bool = False   # one retry on the SAME provider for transient errors (never another provider)
    streaming: bool = True     # UI: show tokens as they arrive vs. reveal when complete
    reasoning: bool = False    # let "thinking" models reason silently before answering (much slower on CPU)
    keep_alive_minutes: int = Field(30, ge=1, le=1440)  # keep the local model in memory between messages
    # tools
    tools_enabled: bool = True             # let the model call tools at all
    web_search: bool = True                # web_search + fetch_url (queries leave the device)
    search_provider: Literal["duckduckgo", "ollama"] = "duckduckgo"
    allow_commands: bool = False           # run_command tool (every call still needs approval)


class AppSettingsPatch(BaseModel):
    """Every field optional. Only fields present in the request are applied (so nullable ones can be reset)."""
    default_mode: Mode | None = None
    cloud_enabled: bool | None = None
    hosted_model: str | None = Field(None, max_length=128)
    ollama_model: str | None = Field(None, max_length=128)
    system_prompt: str | None = Field(None, max_length=4000)
    max_tokens: int | None = Field(None, ge=64, le=32000)
    theme: Literal["dark", "light"] | None = None
    memory_enabled: bool | None = None
    conversation_memory: bool | None = None
    personality: Personality | None = None
    warmth: Level3 | None = None
    humor: Humor | None = None
    detail: Detail | None = None
    tech_depth: Depth | None = None
    formatting: Formatting | None = None
    suggestions: Suggest | None = None
    nickname: str | None = Field(None, max_length=60)
    custom_instructions: str | None = Field(None, max_length=2000)
    temperature: float | None = Field(None, ge=0, le=2)
    top_p: float | None = Field(None, gt=0, le=1)
    context_window: int | None = Field(None, ge=2048, le=262144)
    request_timeout: int | None = Field(None, ge=10, le=900)
    auto_retry: bool | None = None
    streaming: bool | None = None
    reasoning: bool | None = None
    keep_alive_minutes: int | None = Field(None, ge=1, le=1440)
    tools_enabled: bool | None = None
    web_search: bool | None = None
    search_provider: Literal["duckduckgo", "ollama"] | None = None
    allow_commands: bool | None = None


class ApiKeyBody(BaseModel):
    api_key: str = Field(min_length=8, max_length=512)


class ChatRequest(BaseModel):
    request_id: str = Field(min_length=8, max_length=64)
    conversation_id: str | None = None
    message: str | None = None
    mode: Mode | None = None
    model: str | None = Field(None, max_length=128)
    regenerate: bool = False
    confirm_cloud: bool = False  # explicit approval to send private context to a hosted model
    private_context: bool = False  # set by callers that attach private files
    attachment_ids: list[str] = Field(default_factory=list, max_length=8)
    edit: bool = False  # replace the last user message with `message` and answer it again


class VerifyModelBody(BaseModel):
    provider: str = Field(min_length=1, max_length=32)
    model: str = Field(min_length=1, max_length=128)


class ApprovalBody(BaseModel):
    request_id: str
    call_id: str
    approve: bool


class CancelRequest(BaseModel):
    request_id: str


class ConversationPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    archived: bool | None = None


class FeedbackBody(BaseModel):
    value: Literal["up", "down"] | None = None


class ConversationCreate(BaseModel):
    title: str = Field("New conversation", min_length=1, max_length=200)


class AttachmentUpload(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    mime: str = Field("", max_length=128)
    data_b64: str = Field(min_length=1)


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    source: Literal["manual", "message"] = "manual"


class MemoryPatch(BaseModel):
    content: str | None = Field(None, min_length=1, max_length=1000)
    enabled: bool | None = None
