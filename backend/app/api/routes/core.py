from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, Depends, Request

from app.core.errors import AppError
from app.core.security import require_token
from app.providers.base import ChatMessage, ProviderError
from app.schemas.api import ApiKeyBody, AppSettings, AppSettingsPatch, VerifyModelBody

router = APIRouter()
VERSION = "0.1.0"


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": VERSION}


auth = APIRouter(prefix="/api", dependencies=[Depends(require_token)])


@auth.get("/providers/status")
async def providers_status(request: Request) -> list[dict]:
    reg = request.app.state.registry
    results = await asyncio.gather(*(p.status() for p in reg.all()))
    return [r.__dict__ for r in results]


@auth.get("/models")
async def models(request: Request) -> dict:
    out: dict[str, dict] = {}
    for p in request.app.state.registry.all():
        try:
            out[p.id] = {"models": [{**m.__dict__, "can_chat": m.can_chat} for m in await p.list_models()], "error": None}
        except Exception as exc:  # noqa: BLE001
            code = getattr(exc, "code", "error")
            out[p.id] = {"models": [], "error": {"code": code, "message": getattr(exc, "message", str(exc))}}
    return out


VERIFY_PROMPT = "Reply with exactly one word: ready"


@auth.post("/models/verify")
async def verify_model(body: VerifyModelBody, request: Request) -> dict:
    """Prove a model works by generating a real (tiny) reply. Never installs or pulls anything."""
    provider = request.app.state.registry.get(body.provider)
    if provider is None:
        raise AppError(404, "provider_not_found", f"Unknown provider '{body.provider}'.")
    out: dict = {"provider": body.provider, "model": body.model, "ok": False, "latency_ms": None,
                 "first_token_ms": None, "sample": "", "error": None}
    try:
        installed = await provider.list_models()
    except ProviderError as exc:
        out["error"] = {"code": exc.code, "message": exc.message}
        return out
    info = next((m for m in installed if m.id == body.model), None)
    if info is None and body.provider == "ollama":
        out["error"] = {"code": "model_not_found",
                        "message": f"'{body.model}' is not installed in Ollama. FRIDAY won't download it; run: ollama pull {body.model}"}
        return out
    if info is not None and not info.can_chat:
        out["error"] = {"code": "not_a_chat_model", "message": f"'{body.model}' can't chat (capabilities: {', '.join(info.capabilities or [])})."}
        return out
    opts: dict = {"timeout": 180.0}
    budget = 64
    if info is not None and info.capabilities and "thinking" in info.capabilities:
        opts["think"] = False  # ask for no reasoning (some models, e.g. deepseek-r1, reason anyway)…
        budget = 512           # …so leave room to finish reasoning and still answer
    t0 = time.perf_counter()
    parts: list[str] = []

    async def generate() -> None:
        async for chunk in provider.stream([ChatMessage("user", VERIFY_PROMPT)], body.model, None, budget, options=opts):
            if chunk.kind == "delta" and chunk.text:
                if out["first_token_ms"] is None:
                    out["first_token_ms"] = round((time.perf_counter() - t0) * 1000)
                parts.append(chunk.text)
                if sum(map(len, parts)) > 200:
                    break
    try:
        await asyncio.wait_for(generate(), timeout=300)
    except ProviderError as exc:
        out["error"] = {"code": exc.code, "message": exc.message}
    except asyncio.TimeoutError:
        out["error"] = {"code": "timeout", "message": "The model did not answer within 300 seconds."}
    out["latency_ms"] = round((time.perf_counter() - t0) * 1000)
    out["sample"] = "".join(parts).strip()[:200]
    if not out["error"] and not out["sample"]:
        out["error"] = {"code": "empty_response", "message": "The model answered with no text."}
    out["ok"] = out["error"] is None
    return out


@auth.put("/providers/anthropic/key")
async def set_key(body: ApiKeyBody, request: Request) -> dict:
    store = request.app.state.secrets
    store.set("anthropic_api_key", body.api_key.strip())
    return {"configured": True, "persistent": store.persistent}


@auth.delete("/providers/anthropic/key")
async def delete_key(request: Request) -> dict:
    request.app.state.secrets.delete("anthropic_api_key")
    return {"configured": False}


@auth.get("/providers/ollama-search/key")
async def search_key_status(request: Request) -> dict:
    return {"configured": bool(request.app.state.secrets.get("ollama_api_key"))}


@auth.put("/providers/ollama-search/key")
async def set_search_key(body: ApiKeyBody, request: Request) -> dict:
    """The user's own Ollama API key for Ollama web search; kept in the OS credential vault, never returned."""
    store = request.app.state.secrets
    store.set("ollama_api_key", body.api_key.strip())
    return {"configured": True, "persistent": store.persistent}


@auth.delete("/providers/ollama-search/key")
async def delete_search_key(request: Request) -> dict:
    request.app.state.secrets.delete("ollama_api_key")
    return {"configured": False}


@auth.get("/settings")
async def get_settings(request: Request) -> AppSettings:
    return request.app.state.repo.get_settings()


@auth.patch("/settings")
async def patch_settings(patch: AppSettingsPatch, request: Request) -> AppSettings:
    repo = request.app.state.repo
    current = repo.get_settings()
    merged = current.model_copy(update=patch.model_dump(exclude_unset=True))
    try:
        merged = AppSettings.model_validate(merged.model_dump())
    except ValueError as exc:
        raise AppError(422, "invalid_settings", str(exc)) from None
    return repo.save_settings(merged)
