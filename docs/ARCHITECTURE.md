# Architecture

```
Electron main ──spawns──▶ FastAPI backend (127.0.0.1:<random port>, random per-launch token)
   │  IPC allow-list                │  SQLite (conversations, messages, settings)
   ▼                                │  ProviderRegistry ─▶ OllamaProvider (localhost)
Renderer (React)  ──fetch+SSE──────▶│                    └▶ AnthropicProvider (internet)
```
* The renderer gets `{baseUrl, token}` from the main process over a validated IPC channel and calls the backend directly.
* `routing_service.decide_route` is pure and deterministic; `ChatService.prepare` validates + routes **before** writing to the DB,
  `ChatService.run` streams SSE (`meta`, `delta`, `error`, `done`) and persists partial output on cancel/disconnect.
* Cancellation: `POST /api/chat/cancel {request_id}` sets an event; the stream stops even while awaiting the provider.
* Secrets live only in `SecretStore` (Windows Credential Manager via keyring).
* Decisions: sync SQLAlchemy sessions (short transactions, single user); Anthropic as first hosted adapter; Tailwind v3;
  Electron compiled with `tsc` (CommonJS) so the sandboxed preload stays a single plain script.
