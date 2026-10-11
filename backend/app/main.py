from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import attachments, chat, conversations, core, memories, messages
from app.core.config import Settings
from app.core.errors import install_error_handlers
from app.core.logging import setup_logging
from app.core.security import SecretStore
from app.database.repository import Repository
from app.database.session import open_database
from app.providers.hosted import AnthropicProvider
from app.providers.ollama import OllamaProvider
from app.providers.registry import ProviderRegistry
from app.services.chat_service import ChatService

log = logging.getLogger("friday")


def create_app(settings: Settings | None = None, *, secret_store: SecretStore | None = None,
               registry: ProviderRegistry | None = None) -> FastAPI:
    settings = settings or Settings()
    setup_logging()
    engine, session_factory = open_database(settings.db_path)
    secret_store = secret_store or SecretStore()
    repo = Repository(session_factory)
    repo.purge_orphan_attachments()  # uploads that were never sent
    registry = registry or ProviderRegistry([
        OllamaProvider(settings.ollama_url, settings.request_timeout),
        AnthropicProvider(settings.anthropic_base_url, lambda: secret_store.get("anthropic_api_key"),
                          settings.request_timeout),
    ])

    app = FastAPI(title="FRIDAY backend", version=core.VERSION, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings, app.state.repo, app.state.registry = settings, repo, registry
    app.state.secrets, app.state.engine = secret_store, engine
    app.state.chat = ChatService(settings, repo, registry, get_secret=secret_store.get)
    install_error_handlers(app)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                       allow_headers=["content-type", "x-friday-token"])
    app.include_router(core.router)
    core.auth.include_router(conversations.router)
    core.auth.include_router(chat.router)
    core.auth.include_router(attachments.router)
    core.auth.include_router(memories.router)
    core.auth.include_router(messages.router)
    app.include_router(core.auth)
    return app


def run() -> None:
    import uvicorn

    settings = Settings()
    if not settings.token:
        raise SystemExit("FRIDAY_TOKEN is not set; refusing to start an unauthenticated backend.")
    if settings.host not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("FRIDAY backend must bind to loopback only.")
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="warning")


if __name__ == "__main__":
    run()
