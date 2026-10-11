from __future__ import annotations

import logging
import shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from .models import Base

log = logging.getLogger("friday.db")
SCHEMA_VERSION = 3

# Additive column migrations: (table, column, DDL). create_all() adds new tables but never new columns.
_COLUMNS = [
    ("conversations", "archived", "BOOLEAN NOT NULL DEFAULT 0"),
    ("messages", "feedback", "VARCHAR(8)"),
    ("messages", "tools_json", "TEXT"),
    ("attachments", "ocr", "BOOLEAN NOT NULL DEFAULT 0"),
]


def open_database(path: Path):
    """Open (and migrate) the SQLite DB. A corrupt file is moved aside, never deleted."""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        return _open(path)
    except Exception as exc:  # noqa: BLE001
        backup = path.with_suffix(f".corrupt-{datetime.now():%Y%m%d%H%M%S}")
        log.error("database unusable; moving aside", extra={"ctx": {"error": type(exc).__name__}})
        if path.exists():
            shutil.move(str(path), str(backup))
        return _open(path)


def _open(path: Path):
    engine = create_engine(f"sqlite:///{path}", future=True)
    with engine.begin() as conn:
        conn.execute(text("PRAGMA schema_version"))
        version = conn.execute(text("PRAGMA user_version")).scalar() or 0
    Base.metadata.create_all(engine)
    if version < SCHEMA_VERSION:
        with engine.begin() as conn:
            for table, col, ddl in _COLUMNS:
                have = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}
                if col not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
            conn.execute(text(f"PRAGMA user_version = {SCHEMA_VERSION}"))
    return engine, sessionmaker(engine, expire_on_commit=False)
