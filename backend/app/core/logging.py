from __future__ import annotations

import json
import logging
import sys


class JsonFormatter(logging.Formatter):
    """Structured logs. Callers must never pass message content or credentials."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {"ts": self.formatTime(record), "level": record.levelname,
                   "logger": record.name, "msg": record.getMessage()}
        extra = getattr(record, "ctx", None)
        if isinstance(extra, dict):
            payload.update(extra)
        return json.dumps(payload)


def setup_logging() -> None:
    root = logging.getLogger()
    if any(getattr(h, "_friday", False) for h in root.handlers):
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    handler._friday = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
