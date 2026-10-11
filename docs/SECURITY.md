# Security notes (what is actually in place)

* Electron: `contextIsolation`, `sandbox`, no `nodeIntegration`; preload exposes ~8 named functions; every IPC handler checks the
  sender URL; window-open/navigation blocked; only `https:` links open (in the system browser); all permission requests denied;
  production CSP (`connect-src` limited to the backend origin).
* Backend: binds loopback (refuses otherwise), requires `X-Friday-Token` on every `/api` route (constant-time compare), refuses to
  start without a token, CORS limited to the dev server / packaged renderer, docs/OpenAPI disabled, message size cap, parameterised
  SQL via SQLAlchemy, LIKE wildcards escaped, logs contain no message text or keys.
* Model output is rendered as Markdown without raw HTML (tested).
* Not yet covered: request rate limiting, path validation and file approvals (no file features exist yet), dependency audit,
  IPC/e2e security tests against a running Electron. Do not rely on any of those until they exist.
