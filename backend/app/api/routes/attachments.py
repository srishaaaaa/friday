from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.core.errors import AppError
from app.schemas.api import AttachmentUpload
from app.services.attachments import extract

router = APIRouter(prefix="/attachments")
PREVIEW_CHARS = 6000


def attachment_meta(a) -> dict:  # noqa: ANN001
    return {"id": a.id, "name": a.name, "mime": a.mime, "size": a.size, "kind": a.kind, "pages": a.pages,
            "chars": len(a.text) if a.text else 0, "truncated": a.truncated, "ocr": bool(a.ocr), "created_at": a.created_at,
            "sent": a.message_id is not None}


@router.post("", status_code=201)
def upload(body: AttachmentUpload, request: Request) -> dict:
    ex = extract(body.name, body.mime, body.data_b64)
    a = request.app.state.repo.add_attachment(name=body.name, mime=ex.mime, size=ex.size, kind=ex.kind, text=ex.text,
                                              data_b64=ex.data_b64, pages=ex.pages, truncated=ex.truncated, ocr=ex.ocr)
    return attachment_meta(a)


@router.get("/{att_id}")
def get_one(att_id: str, request: Request, data: bool = Query(False)) -> dict:
    a = request.app.state.repo.get_attachment(att_id)
    if not a:
        raise AppError(404, "attachment_not_found", "Attachment not found.")
    out = attachment_meta(a)
    out["preview"] = (a.text or "")[:PREVIEW_CHARS]
    if data and a.kind == "image":
        out["data_url"] = f"data:{a.mime};base64,{a.data_b64}"
    return out


@router.delete("/{att_id}")
def delete(att_id: str, request: Request) -> dict:
    if not request.app.state.repo.delete_unlinked_attachment(att_id):
        raise AppError(404, "attachment_not_found", "Attachment not found or already sent.")
    return {"deleted": 1}
