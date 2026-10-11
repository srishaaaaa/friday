"""Deterministic, transparent routing. No model call is made to decide a route.

Invariants (tested):
  * LOCAL never resolves to a hosted provider.
  * A failed local request is never retried against a hosted provider (the chat service has no fallback).
  * SMART prefers local for private context and refuses to cross the device boundary without approval.
  * Ollama "cloud" models (``name:cloud`` / ``name-cloud``) run on Ollama's servers: they are reported as
    leaving the device, never count as "local" for private content, and need the same approval.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.errors import AppError
from app.schemas.api import AppSettings, Mode

_CODE_HINTS = re.compile(
    r"```|\b(def|class|function|import|traceback|stack trace|exception|compile|refactor|unit test|"
    r"bug|regex|sql|typescript|javascript|python|java|react)\b", re.I)
LONG_CONTEXT_CHARS = 12_000
_OLLAMA_CLOUD = re.compile(r"[:-]cloud$", re.I)


def is_ollama_cloud(model: str | None) -> bool:
    return bool(model) and bool(_OLLAMA_CLOUD.search(model))  # type: ignore[arg-type]


@dataclass
class RouteDecision:
    provider_id: str
    model: str
    mode: Mode
    category: str
    reason: str
    leaves_device: bool


def classify(text: str, private_context: bool) -> str:
    if private_context:
        return "private"
    if len(text) > LONG_CONTEXT_CHARS:
        return "long_context"
    if _CODE_HINTS.search(text):
        return "coding"
    return "general"


def decide_route(*, mode: Mode, prefs: AppSettings, text: str, cloud_configured: bool,
                 model_override: str | None, private_context: bool, confirm_cloud: bool) -> RouteDecision:
    category = classify(text, private_context)
    local_model = model_override if mode == "local" and model_override else prefs.ollama_model
    cloud_model = model_override if mode == "cloud" and model_override else prefs.hosted_model

    local_is_remote = is_ollama_cloud(local_model)

    def local(reason: str) -> RouteDecision:
        if not local_model:
            raise AppError(409, "no_local_model",
                           "No local model is selected. Choose an Ollama model in Settings.")
        if local_is_remote:
            if private_context and not confirm_cloud:
                raise AppError(409, "confirmation_required",
                               f"This request includes private content and '{local_model}' runs on Ollama's "
                               f"servers, not this device. Confirm to continue, or pick an on-device model.")
            reason = reason.replace("processed on this device only", "processed by Ollama cloud (leaves this device)")
            reason = reason.replace("handled locally", "handled by Ollama cloud")
            return RouteDecision("ollama", local_model, mode, category, reason, True)
        return RouteDecision("ollama", local_model, mode, category, reason, False)

    def cloud(reason: str) -> RouteDecision:
        if private_context and not confirm_cloud:
            raise AppError(409, "confirmation_required",
                           f"This request includes private content and would be sent to "
                           f"{prefs.hosted_provider} ({cloud_model}). Confirm to continue.")
        return RouteDecision(prefs.hosted_provider, cloud_model, mode, category, reason, True)

    if mode == "local":
        return local("Local mode: processed on this device only.")

    if mode == "cloud":
        if not prefs.cloud_enabled:
            raise AppError(409, "cloud_disabled", "Cloud routing is turned off in Settings.")
        if not cloud_configured:
            raise AppError(409, "not_configured", "No hosted API key is configured. Add one in Settings.")
        return cloud("Cloud mode: sent to the hosted provider.")

    # smart
    cloud_ok = prefs.cloud_enabled and cloud_configured
    if category == "private":
        if local_model and not local_is_remote:
            return local("Smart: private content stays on this device.")
        if local_model and local_is_remote:
            return local("Smart: private content sent to Ollama cloud with your approval.")
        if cloud_ok:
            return cloud("Smart: no local model available; approval required for private content.")
        return local("Smart: private content stays local.")  # raises no_local_model
    if category in ("coding", "long_context") and cloud_ok:
        return cloud(f"Smart: {category.replace('_', ' ')} task routed to the hosted model.")
    if local_model:
        return local("Smart: general task handled locally.")
    if cloud_ok:
        return cloud("Smart: no local model selected; using the hosted model.")
    raise AppError(409, "no_provider",
                   "No provider is ready. Select an Ollama model or add a hosted API key in Settings.")
