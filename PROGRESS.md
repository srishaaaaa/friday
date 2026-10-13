# Progress

Done: M1 scaffold, M2 shell+UI (unlaunched), M3 FastAPI + hosted adapter, M4 Ollama adapter, M5 routing, M6 history/export.
Tests: backend 30 passed; frontend typecheck clean, 16 vitest passed; renderer `vite build` OK; Electron main `tsc` OK;
live smoke test (real uvicorn process + mock Ollama over HTTP) OK.
Not verified: Electron launch, Windows keyring, real Ollama, real hosted API, PyInstaller build, NSIS installer.
Next: run `npm run setup && npm run dev` on Windows and report anything broken → then M7 memory, M8 documents, M9 coding tools,
M10 privacy/diagnostics/hardware, first-launch wizard, Playwright e2e, build + install verification (M12).

## 2026-10-12 — UI redesign + first real Windows run
Verified on Windows: `npm run setup`, Electron launch, real Ollama (0.40.3) with `gemma4:cloud` + `gemma4:e2b`.
* Launch gotcha: VS Code terminals set `ELECTRON_RUN_AS_NODE=1`; clear it before `npm run dev`.
* `npm run shortcut` builds the app and adds FRIDAY to the Start menu + desktop (runs unpackaged; backend uses `backend/.venv`).
* New renderer: design tokens + 7 glass variants (`styles/index.css`), motion presets (`design/motion.ts`), Framer Motion,
  AI core orb (`AIOrb`) + welcome-page robot (`AIRobot`) driven by real chat state, onboarding, command palette (Ctrl+K),
  tabbed settings, System panel (health/providers/models/hardware), toasts, dialogs with focus trap, KaTeX math.
* UI-only prefs (accent, motion, transparency, density, core, ambient, sidebar, onboarded) live in localStorage (`usePrefs`).
* New Electron IPC: `friday:system-info`, `friday:login-item` (packaged only), `friday:is-pinned`.
* Replies via Ollama `*:cloud` models are labelled "Ollama cloud". Backend Smart routing still treats every Ollama model as
  local — a `:cloud` model selected as the local model would receive "private" content (UI warns; backend fix pending).
Not built (no backend yet): memory, attachments/document panel, code-diff panel, edit message, feedback, voice.

## 2026-10-12 (later) — memory, attachments, response engine, routing fix
* Routing: Ollama `*:cloud` / `*-cloud` models are `leaves_device=true`; private content (any conversation with
  attachments) never goes to them — or to a hosted model — without `confirm_cloud` (UI shows a confirmation dialog).
* Attachments: `POST /api/attachments` (base64 JSON) → text extracted locally (text/code, PDF via pypdf, DOCX via zip XML),
  images kept for vision models; linked to the user message on send; Document panel shows metadata + extracted text.
* Memory: `/api/memories` CRUD + clear; enabled memories are appended to the system prompt when `memory_enabled`.
* Response pipeline (`services/chat_service.py`, `services/prompting.py`): intent detection → context (history,
  attachments, memories; trimmed-context count) → instruction assembly (user's base prompt + personality + task guidance
  + nickname + custom instructions + memories) → routing → stream (optional single same-provider retry) → persist.
  SSE `meta` now carries `intent`, `context_dropped`, `activity`; new `status` event.
* Settings: personality/warmth/humor/detail/depth/formatting/suggestions/nickname/custom instructions; temperature,
  top-p, Ollama context window (auto-sized when unset), timeout, auto-retry, streaming toggle, conversation memory.
  Old default prompt auto-upgrades to the new default; user lines appended to it move to custom instructions.
* Edit-and-resend last message (`edit: true`), thumbs feedback (`PUT /api/messages/{id}/feedback`), archive.
* DB schema v2: additive column migration (`conversations.archived`, `messages.feedback`) in `database/session.py`.
* Window min size 480×500 (was 900×600).
Tests: backend 44, frontend 30. Verified live with Ollama gemma4:cloud (attachment answer, memory use, 409 without consent).
Not built: web search/citations, tool execution, OCR for scanned PDFs, per-message model override in the UI.

## 2026-10-12 (late) — tools, web search with sources, OCR
* Tool calling (Ollama `tools` / Anthropic `tool_use`), agent loop in `ChatService.run` (≤6 rounds). SSE: `tool_request`,
  `tool_start`, `tool_result` (+ numbered `sources`); stored per reply in `messages.tools_json` (schema v3).
* Tools (`services/tools.py`): calculator (AST, arithmetic only), date/time, web_search, fetch_url, save_file
  (Documents\FRIDAY), open_url, run_command (PowerShell; off by default). Side-effect tools ALWAYS need approval
  (`POST /api/chat/approve`, 5-min timeout = deny); web tools need approval when the conversation is private.
  Models without tool support fall back to a plain answer (status note).
* Web (`services/websearch.py`): DuckDuckGo HTML (no key, default) or Ollama web search with the user's own key
  (`/api/providers/ollama-search/key`, stored in Credential Manager). fetch_url blocks localhost/private/link-local
  hosts and re-checks every redirect.
* OCR (`services/ocr.py`): Windows.Media.Ocr via winrt, offline. PDF pages with < 25 chars of text are OCR'd from their
  embedded images; images are OCR'd too (text passed alongside the image). Requires an installed Windows OCR language.
* Settings → Tools & web. Tests: backend 54, frontend 34. Verified live with gemma4:cloud: calculator, web search with
  sources, save_file allowed/declined, scanned-invoice OCR.

## 2026-10-12 — model discovery & verification
* Ollama models are discovered from `/api/tags` with full metadata (exact id, size, family, parameter size,
  quantization, context length, capabilities, remote host). `ModelInfo.can_chat` hides embedding-only models.
* `POST /api/models/verify {provider, model}`: real tiny generation (think=false for thinking models), returns
  latency / first-token time / sample or a stable error (model_not_found never triggers a download).
* Picker shows exact ids + metadata + capability badges, refreshes on open and on window focus, warns when the
  selected model is no longer installed. Settings → AI providers: per-model Test / Test all.
* Switching models only changes who answers next; the conversation (and its history) is untouched.

## 2026-10-14 — logo + reply speed
* Brand logo: `apps/desktop/build/friday-logo.png` (source), `icon.ico`/`icon.png`/`public/logo-mark.png` (mark crop) for the
  window, shortcuts and favicon. In-app vector `FridayLogo` follows the theme accents (`brand` prop = original colors).
* Measured latency (gemma4:e2b on CPU): cold 101 s → causes were model reloads (Ollama unload after 5 min; any num_ctx change),
  hidden "thinking" (~25 s), and a system prompt that changed per message (busting Ollama's prompt cache, ~18 s).
  Fixes: think=false unless Settings → Generation → Reasoning; keep_alive 30 min; stable num_ctx 8192 (16K/32K only if needed);
  per-message guidance moved onto the user turn; background warm-up (`POST /api/chat/warmup`) on start and model/prompt changes.
  Result: warm local first word 3–5 s (was ~27 s), cloud 1.2–2 s. Each reply stores first_token_ms / total_ms (shown in UI).
