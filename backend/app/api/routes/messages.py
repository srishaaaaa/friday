from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.errors import AppError
from app.schemas.api import FeedbackBody

router = APIRouter(prefix="/messages")


@router.put("/{msg_id}/feedback")
def feedback(msg_id: str, body: FeedbackBody, request: Request) -> dict:
    if not request.app.state.repo.set_feedback(msg_id, body.value):
        raise AppError(404, "message_not_found", "Assistant message not found.")
    return {"id": msg_id, "feedback": body.value}
