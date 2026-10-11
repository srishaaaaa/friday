from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.core.errors import AppError
from app.schemas.api import MemoryCreate, MemoryPatch

router = APIRouter(prefix="/memories")
MAX_MEMORIES = 500


def _out(m) -> dict:  # noqa: ANN001
    return {"id": m.id, "content": m.content, "enabled": m.enabled, "source": m.source,
            "created_at": m.created_at, "updated_at": m.updated_at}


@router.get("")
def list_memories(request: Request, q: str | None = Query(None, max_length=200)) -> list[dict]:
    return [_out(m) for m in request.app.state.repo.list_memories(q)]


@router.post("", status_code=201)
def create(body: MemoryCreate, request: Request) -> dict:
    repo = request.app.state.repo
    if len(repo.list_memories()) >= MAX_MEMORIES:
        raise AppError(409, "memory_full", f"Memory is full ({MAX_MEMORIES} items). Delete some first.")
    if not body.content.strip():
        raise AppError(422, "empty_memory", "Memory text is empty.")
    return _out(repo.add_memory(body.content, body.source))


@router.patch("/{mem_id}")
def update(mem_id: str, body: MemoryPatch, request: Request) -> dict:
    m = request.app.state.repo.update_memory(mem_id, body.content, body.enabled)
    if not m:
        raise AppError(404, "memory_not_found", "Memory not found.")
    return _out(m)


@router.delete("")
def delete_all(request: Request) -> dict:
    return {"deleted": request.app.state.repo.delete_all_memories()}


@router.delete("/{mem_id}")
def delete(mem_id: str, request: Request) -> dict:
    if not request.app.state.repo.delete_memory(mem_id):
        raise AppError(404, "memory_not_found", "Memory not found.")
    return {"deleted": 1}
