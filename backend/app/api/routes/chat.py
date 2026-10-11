from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.errors import AppError
from app.schemas.api import ApprovalBody, CancelRequest, ChatRequest

router = APIRouter(prefix="/chat")


@router.post("/stream")
async def stream(body: ChatRequest, request: Request) -> StreamingResponse:
    svc = request.app.state.chat
    prepared = svc.prepare(body)  # raises AppError (4xx JSON) before any streaming starts
    return StreamingResponse(svc.run(prepared), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/approve")
async def approve(body: ApprovalBody, request: Request) -> dict:
    """The answer (Allow or Deny) to a tool_request event for a running request."""
    if not request.app.state.chat.approve(body.request_id, body.call_id, body.approve):
        raise AppError(404, "approval_not_found", "That action is no longer waiting for approval.")
    return {"ok": True}


@router.post("/cancel")
async def cancel(body: CancelRequest, request: Request) -> dict:
    return {"cancelled": request.app.state.chat.cancel(body.request_id)}
