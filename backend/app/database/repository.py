from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.schemas.api import AppSettings
from app.services.prompting import LEGACY_SYSTEM_PROMPT

from .models import AppSetting, Attachment, Conversation, Memory, Message


def _esc(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class Repository:
    def __init__(self, session_factory: sessionmaker[Session]):
        self.sf = session_factory

    # ---- settings -------------------------------------------------------
    def get_settings(self) -> AppSettings:
        with self.sf() as s:
            row = s.get(AppSetting, "app")
            if not row:
                return AppSettings()
            try:
                data = json.loads(row.value)
            except ValueError:
                return AppSettings()
            prompt = data.get("system_prompt") or ""
            if prompt.startswith(LEGACY_SYSTEM_PROMPT):
                # v0.1 default (possibly with the user's own lines appended) → current default prompt,
                # keeping anything the user added as custom instructions.
                extra = prompt[len(LEGACY_SYSTEM_PROMPT):].strip()
                data.pop("system_prompt")
                if extra and not (data.get("custom_instructions") or "").strip():
                    data["custom_instructions"] = extra
            try:
                return AppSettings.model_validate(data)
            except ValueError:
                return AppSettings()

    def save_settings(self, settings: AppSettings) -> AppSettings:
        with self.sf() as s, s.begin():
            row = s.get(AppSetting, "app")
            payload = settings.model_dump_json()
            if row:
                row.value = payload
            else:
                s.add(AppSetting(key="app", value=payload))
        return settings

    # ---- conversations --------------------------------------------------
    def create_conversation(self, title: str = "New conversation") -> Conversation:
        with self.sf() as s, s.begin():
            conv = Conversation(title=title[:200])
            s.add(conv)
        return conv

    def get_conversation(self, conv_id: str) -> Conversation | None:
        with self.sf() as s:
            conv = s.get(Conversation, conv_id)
            if conv:
                _ = conv.messages  # load while session is open
            return conv

    def list_conversations(self, q: str | None, limit: int, offset: int, archived: bool = False) -> list[dict]:
        with self.sf() as s:
            stmt = select(Conversation).where(Conversation.archived.is_(archived))
            if q:
                like = f"%{_esc(q)}%"
                hit = select(Message.conversation_id).where(Message.content.ilike(like, escape="\\"))
                stmt = stmt.where(Conversation.title.ilike(like, escape="\\") | Conversation.id.in_(hit))
            stmt = stmt.order_by(Conversation.updated_at.desc()).limit(limit).offset(offset)
            return [{"id": c.id, "title": c.title, "created_at": c.created_at, "updated_at": c.updated_at,
                     "archived": c.archived} for c in s.scalars(stmt)]

    def rename_conversation(self, conv_id: str, title: str) -> bool:
        return self.update_conversation(conv_id, title=title)

    def update_conversation(self, conv_id: str, *, title: str | None = None, archived: bool | None = None) -> bool:
        with self.sf() as s, s.begin():
            conv = s.get(Conversation, conv_id)
            if not conv:
                return False
            if title is not None:
                conv.title = title
            if archived is not None:
                conv.archived = archived
            return True

    def delete_conversation(self, conv_id: str) -> bool:
        with self.sf() as s, s.begin():
            conv = s.get(Conversation, conv_id)
            if not conv:
                return False
            s.delete(conv)
            return True

    def delete_all_conversations(self) -> int:
        with self.sf() as s, s.begin():
            n = s.scalar(select(func.count()).select_from(Conversation)) or 0
            s.execute(delete(Message))
            s.execute(delete(Conversation))
            return n

    # ---- messages -------------------------------------------------------
    def add_message(self, conv_id: str, role: str, content: str, *, status: str = "ok",
                    provider: str | None = None, model: str | None = None,
                    route_reason: str | None = None, usage: dict | None = None,
                    attachment_ids: list[str] | None = None, tools: list[dict] | None = None) -> Message:
        with self.sf() as s, s.begin():
            seq = (s.scalar(select(func.max(Message.seq)).where(Message.conversation_id == conv_id)) or 0) + 1
            msg = Message(conversation_id=conv_id, seq=seq, role=role, content=content, status=status,
                          provider=provider, model=model, route_reason=route_reason,
                          usage_json=json.dumps(usage) if usage else None,
                          tools_json=json.dumps(tools) if tools else None)
            s.add(msg)
            s.flush()
            if attachment_ids:  # link uploaded (still unlinked) attachments to this message
                for a in s.scalars(select(Attachment).where(Attachment.id.in_(attachment_ids), Attachment.message_id.is_(None))):
                    a.message_id = msg.id
            conv = s.get(Conversation, conv_id)
            if conv:
                conv.updated_at = datetime.now(timezone.utc)
        return msg

    def edit_last_user_message(self, conv_id: str, content: str) -> bool:
        """Replace the last user message's text and drop everything after it (attachments are kept)."""
        with self.sf() as s, s.begin():
            last = s.scalars(select(Message).where(Message.conversation_id == conv_id, Message.role == "user")
                             .order_by(Message.seq.desc()).limit(1)).first()
            if not last:
                return False
            last.content = content
            for m in s.scalars(select(Message).where(Message.conversation_id == conv_id, Message.seq > last.seq)):
                s.delete(m)
            conv = s.get(Conversation, conv_id)
            if conv:
                conv.updated_at = datetime.now(timezone.utc)
            return True

    def set_feedback(self, msg_id: str, value: str | None) -> bool:
        with self.sf() as s, s.begin():
            m = s.get(Message, msg_id)
            if not m or m.role != "assistant":
                return False
            m.feedback = value
            return True

    def delete_message(self, msg_id: str) -> None:
        with self.sf() as s, s.begin():
            s.execute(delete(Message).where(Message.id == msg_id))

    # ---- attachments ----------------------------------------------------
    def add_attachment(self, **fields) -> Attachment:
        with self.sf() as s, s.begin():
            a = Attachment(**fields)
            s.add(a)
        return a

    def get_attachment(self, att_id: str) -> Attachment | None:
        with self.sf() as s:
            return s.get(Attachment, att_id)

    def get_attachments(self, ids: list[str]) -> list[Attachment]:
        if not ids:
            return []
        with self.sf() as s:
            found = {a.id: a for a in s.scalars(select(Attachment).where(Attachment.id.in_(ids)))}
            return [found[i] for i in ids if i in found]

    def delete_unlinked_attachment(self, att_id: str) -> bool:
        """Only attachments not yet sent can be removed individually; sent ones go with their message."""
        with self.sf() as s, s.begin():
            a = s.get(Attachment, att_id)
            if not a or a.message_id is not None:
                return False
            s.delete(a)
            return True

    def purge_orphan_attachments(self, older_than: timedelta = timedelta(days=1)) -> int:
        cutoff = datetime.now(timezone.utc) - older_than
        with self.sf() as s, s.begin():
            res = s.execute(delete(Attachment).where(Attachment.message_id.is_(None), Attachment.created_at < cutoff))
            return res.rowcount or 0

    # ---- memories -------------------------------------------------------
    def list_memories(self, q: str | None = None, only_enabled: bool = False) -> list[Memory]:
        with self.sf() as s:
            stmt = select(Memory)
            if q:
                stmt = stmt.where(Memory.content.ilike(f"%{_esc(q)}%", escape="\\"))
            if only_enabled:
                stmt = stmt.where(Memory.enabled.is_(True))
            return list(s.scalars(stmt.order_by(Memory.updated_at.desc())))

    def add_memory(self, content: str, source: str = "manual") -> Memory:
        with self.sf() as s, s.begin():
            m = Memory(content=content.strip(), source=source)
            s.add(m)
        return m

    def update_memory(self, mem_id: str, content: str | None, enabled: bool | None) -> Memory | None:
        with self.sf() as s, s.begin():
            m = s.get(Memory, mem_id)
            if not m:
                return None
            if content is not None:
                m.content = content.strip()
            if enabled is not None:
                m.enabled = enabled
            m.updated_at = datetime.now(timezone.utc)
            return m

    def delete_memory(self, mem_id: str) -> bool:
        with self.sf() as s, s.begin():
            m = s.get(Memory, mem_id)
            if not m:
                return False
            s.delete(m)
            return True

    def delete_all_memories(self) -> int:
        with self.sf() as s, s.begin():
            n = s.scalar(select(func.count()).select_from(Memory)) or 0
            s.execute(delete(Memory))
            return n
