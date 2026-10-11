from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def default_data_dir() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home() / ".local" / "share")
    return Path(base) / "FRIDAY"


class Settings(BaseSettings):
    """Process-level configuration. User-facing preferences live in the database."""

    model_config = SettingsConfigDict(env_prefix="FRIDAY_", env_file=".env", extra="ignore")

    data_dir: Path = default_data_dir()
    host: str = "127.0.0.1"
    port: int = 8765
    token: str = ""  # shared secret between Electron main process and backend
    ollama_url: str = "http://127.0.0.1:11434"
    anthropic_base_url: str = "https://api.anthropic.com"
    request_timeout: float = 120.0
    max_message_chars: int = 50_000
    context_char_budget: int = 48_000
    cors_origins: list[str] = ["http://localhost:5173", "null"]

    @property
    def db_path(self) -> Path:
        return self.data_dir / "friday.db"
