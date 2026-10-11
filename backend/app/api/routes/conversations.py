from __future__ import annotations

import json

from fastapi import APIRouter, Query, Request
from fastapi.responses import PlainTextResponse

from app.api.routes.attachments import attachment_meta
from app.core.errors import AppError
from app.schemas.api import ConversationCreate, ConversationPatch

router = APIRouter(prefix="/conversations")


def _msg(m) -> dict:  # noqa: ANN001
    return {"id": m.id, "role": m.role, "content": m.content, "status": m.status, "provider": m.provider,
            "model": m.model, "route_reason": m.route_reason, "created_at": m.created_at, "feedback": m.feedback,
            "attachments": [attachment_meta(a) for a in m.attachments],
            **_tools(m)}


def _tools(m) -> dict:  # noqa: ANN001
    """Stored tool activity: {"tools": [...], "sources": [...]} (empty when the reply used no tools)."""
    if not m.tools_json:
        return {"tools": [], "sources": []}
    try:
        data = json.loads(m.tools_json)
    except ValueError:
        return {"tools": [], "sources": []}
    return {"tools": data.get("tools", []), "sources": data.get("sources", [])}


def _att_note(m) -> str:  # noqa: ANN001
    return ("\n\n_Attached: " + ", ".join(a.name for a in m.attachments) + "_") if m.attachments else ""


@router.get("")
def list_conversations(request: Request, q: str | None = Query(None, max_length=200),
                       limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                       archived: bool = Query(False)) -> list[dict]:
    return request.app.state.repo.list_conversations(q, limit, offset, archived)


@router.post("", status_code=201)
def create(body: ConversationCreate, request: Request) -> dict:
    c = request.app.state.repo.create_conversation(body.title)
    return {"id": c.id, "title": c.title, "created_at": c.created_at, "updated_at": c.updated_at}


@router.delete("")
def delete_all(request: Request) -> dict:
    return {"deleted": request.app.state.repo.delete_all_conversations()}


@router.get("/{conv_id}")
def get_one(conv_id: str, request: Request) -> dict:
    c = request.app.state.repo.get_conversation(conv_id)
    if not c:
        raise AppError(404, "conversation_not_found", "Conversation not found.")
    return {"id": c.id, "title": c.title, "created_at": c.created_at, "updated_at": c.updated_at,
            "archived": c.archived, "messages": [_msg(m) for m in c.messages]}


@router.patch("/{conv_id}")
def update(conv_id: str, body: ConversationPatch, request: Request) -> dict:
    title = body.title.strip() if body.title is not None else None
    if title == "":
        raise AppError(422, "empty_title", "Title cannot be empty.")
    if not request.app.state.repo.update_conversation(conv_id, title=title, archived=body.archived):
        raise AppError(404, "conversation_not_found", "Conversation not found.")
    return {"id": conv_id, "title": title, "archived": body.archived}


@router.delete("/{conv_id}")
def delete(conv_id: str, request: Request) -> dict:
    if not request.app.state.repo.delete_conversation(conv_id):
        raise AppError(404, "conversation_not_found", "Conversation not found.")
    return {"deleted": 1}


@router.get("/{conv_id}/export", response_class=PlainTextResponse)
def export(conv_id: str, request: Request, format: str = Query("md", pattern="^(md|txt)$")) -> PlainTextResponse:
    c = request.app.state.repo.get_conversation(conv_id)
    if not c:
        raise AppError(404, "conversation_not_found", "Conversation not found.")
    if format == "md":
        body = f"# {c.title}\n\n" + "\n\n".join(
            f"**{'You' if m.role == 'user' else 'FRIDAY'}**\n\n{m.content}{_att_note(m)}" for m in c.messages)
    else:
        body = f"{c.title}\n{'=' * len(c.title)}\n\n" + "\n\n".join(
            f"{'You' if m.role == 'user' else 'FRIDAY'}: {m.content}{_att_note(m)}" for m in c.messages)
    return PlainTextResponse(body, media_type="text/markdown" if format == "md" else "text/plain")
