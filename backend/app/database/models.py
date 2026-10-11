from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Index, String, Text, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, index=True)
    archived: Mapped[bool] = mapped_column(default=False)
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.seq")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_conv_seq", "conversation_id", "seq"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    seq: Mapped[int] = mapped_column()
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | cancelled | error
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    route_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    usage_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback: Mapped[str | None] = mapped_column(String(8), nullable=True)  # up | down
    tools_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # tool activity + sources for this reply
    created_at: Mapped[datetime] = mapped_column(default=_now)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    attachments: Mapped[list["Attachment"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class Memory(Base):
    """A fact the user explicitly asked FRIDAY to remember. Included in the system prompt when enabled."""
    __tablename__ = "memories"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    content: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(default=True)
    source: Mapped[str] = mapped_column(String(16), default="manual")  # manual | message
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, index=True)


class Attachment(Base):
    """An uploaded file. `text` holds extracted text (documents); `data_b64` holds image bytes."""
    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    message_id: Mapped[str | None] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(128))
    size: Mapped[int] = mapped_column()
    kind: Mapped[str] = mapped_column(String(16))  # text | image
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    pages: Mapped[int | None] = mapped_column(nullable=True)
    truncated: Mapped[bool] = mapped_column(default=False)
    ocr: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class AppSetting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn, _):  # noqa: ANN001
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.close()
