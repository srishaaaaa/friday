"""Tools the model may call. Each tool validates its own input and declares when it needs user approval.

Safety rules:
  * Anything with side effects (writing files, opening links, running commands) ALWAYS needs approval.
  * Network tools need approval when the conversation contains private content (the query could leak it).
  * run_command is off unless the user enables it in Settings, and every call still needs approval.
  * Tool output is untrusted data: it is returned to the model as content, never executed.
"""
from __future__ import annotations

import ast
import asyncio
import math
import operator
import os
import re
import subprocess
import webbrowser
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

from app.services import websearch

TOOL_TIMEOUT = 60.0


@dataclass
class ToolContext:
    private: bool
    web_enabled: bool
    allow_commands: bool
    search_provider: str
    get_search_key: Callable[[], str | None]
    files_dir: Path


@dataclass
class ToolResult:
    content: str                      # what the model sees
    summary: str                      # one line for the UI
    ok: bool = True
    sources: list[dict] = field(default_factory=list)


@dataclass
class Tool:
    name: str
    label: str                        # UI verb, e.g. "Searching the web"
    description: str
    parameters: dict
    run: Callable[[dict, ToolContext], Awaitable[ToolResult]]
    needs_approval: Callable[[dict, ToolContext], bool] = lambda a, c: False  # noqa: E731
    available: Callable[[ToolContext], bool] = lambda c: True  # noqa: E731
    describe: Callable[[dict], str] = lambda a: ""  # noqa: E731

    def schema(self) -> dict:
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


def _obj(props: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": props, "required": required}


# ---------------------------------------------------------------- calculator
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos}
_FUNCS = {n: getattr(math, n) for n in ("sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "log", "log10", "log2", "exp",
                                       "floor", "ceil", "factorial", "radians", "degrees")} | {"abs": abs, "round": round, "min": min, "max": max}
_CONSTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def safe_eval(expr: str) -> float | int:
    """Arithmetic only: numbers, + - * / // % **, a few math functions. No names, attributes or calls beyond those."""
    def ev(n: ast.AST):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            left, right = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Pow) and abs(right) > 1000:
                raise ValueError("exponent too large")
            return _OPS[type(n.op)](left, right)
        if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.operand))
        if isinstance(n, ast.Name) and n.id in _CONSTS:
            return _CONSTS[n.id]
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in _FUNCS and not n.keywords:
            return _FUNCS[n.func.id](*[ev(a) for a in n.args])
        raise ValueError("unsupported expression")
    expr = expr.replace("^", "**").replace("×", "*").replace("÷", "/")
    if len(expr) > 300:
        raise ValueError("expression too long")
    return ev(ast.parse(expr, mode="eval"))


async def _calc(a: dict, _: ToolContext) -> ToolResult:
    expr = str(a.get("expression", ""))
    try:
        v = safe_eval(expr)
    except (ValueError, SyntaxError, ZeroDivisionError, OverflowError, TypeError) as exc:
        return ToolResult(f"Error: {exc}", f"Could not evaluate {expr!r}", ok=False)
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
        v = int(v)
    return ToolResult(f"{expr} = {v}", f"{expr} = {v}")


async def _now(_: dict, __: ToolContext) -> ToolResult:
    now = datetime.now().astimezone()
    s = now.strftime("%A, %d %B %Y, %H:%M %Z (UTC%z)")
    return ToolResult(s, s)


# ---------------------------------------------------------------- web
async def _search(a: dict, ctx: ToolContext) -> ToolResult:
    q = str(a.get("query", "")).strip()[:300]
    n = max(1, min(int(a.get("max_results") or 5), 8))
    if not q:
        return ToolResult("Error: empty query", "Empty search query", ok=False)
    try:
        if ctx.search_provider == "ollama" and ctx.get_search_key():
            results = await websearch.ollama_search(q, n, ctx.get_search_key() or "")
        else:
            results = await websearch.duckduckgo(q, n)
    except websearch.WebError as exc:
        return ToolResult(f"Error: {exc}", str(exc), ok=False)
    if not results:
        return ToolResult(f"No results for {q!r}.", f"No results for “{q}”")
    lines = [f"[{i}] {r.title}\nURL: {r.url}\n{r.snippet}" for i, r in enumerate(results, 1)]
    content = (f"Search results for {q!r} (cite as [n]; fetch_url a result for full detail):\n\n" + "\n\n".join(lines))
    return ToolResult(content, f"{len(results)} results for “{q}”",
                      sources=[{"title": r.title, "url": r.url, "snippet": r.snippet} for r in results])


async def _fetch(a: dict, _: ToolContext) -> ToolResult:
    url = str(a.get("url", "")).strip()
    try:
        final, title, text = await websearch.fetch_page(url)
    except websearch.WebError as exc:
        return ToolResult(f"Error: {exc}", str(exc), ok=False)
    return ToolResult(f"Page: {title}\nURL: {final}\n\n{text}", f"Read “{title[:80]}”",
                      sources=[{"title": title, "url": final, "snippet": text[:200]}])


# ---------------------------------------------------------------- actions (always approved)
_SAFE_NAME = re.compile(r"[^\w\-. ]+")
_ALLOWED_EXT = {".txt", ".md", ".csv", ".json", ".html", ".css", ".js", ".ts", ".py", ".yaml", ".yml", ".xml", ".sql", ".ps1", ".sh", ".ini", ".log"}


def _target_file(name: str, root: Path) -> Path:
    base = _SAFE_NAME.sub("_", Path(name).name).strip(" .") or "friday-note.txt"
    if Path(base).suffix.lower() not in _ALLOWED_EXT:
        base += ".txt"
    target = root / base
    i = 2
    while target.exists():
        target = root / f"{Path(base).stem} ({i}){Path(base).suffix}"
        i += 1
    return target


async def _save(a: dict, ctx: ToolContext) -> ToolResult:
    content = str(a.get("content", ""))
    if len(content) > 1_000_000:
        return ToolResult("Error: content too large (max 1 MB)", "File too large", ok=False)
    ctx.files_dir.mkdir(parents=True, exist_ok=True)
    target = _target_file(str(a.get("filename", "")), ctx.files_dir)
    await asyncio.to_thread(target.write_text, content, "utf-8")
    return ToolResult(f"Saved {len(content)} characters to {target}", f"Saved {target.name}", sources=[])


async def _open(a: dict, _: ToolContext) -> ToolResult:
    url = str(a.get("url", "")).strip()
    if not re.match(r"^https?://", url, re.I):
        return ToolResult("Error: only http(s) links can be opened", "Refused non-web link", ok=False)
    ok = await asyncio.to_thread(webbrowser.open, url)
    return ToolResult(f"Opened {url} in the default browser." if ok else "Could not open the browser.",
                      f"Opened {url}" if ok else "Could not open the browser", ok=ok)


async def _command(a: dict, ctx: ToolContext) -> ToolResult:
    cmd = str(a.get("command", "")).strip()
    if not ctx.allow_commands:
        return ToolResult("Error: running commands is disabled in Settings.", "Commands are disabled", ok=False)
    if not cmd or len(cmd) > 2000:
        return ToolResult("Error: invalid command", "Invalid command", ok=False)
    shell = ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd] if os.name == "nt" else ["/bin/sh", "-c", cmd]

    def go() -> subprocess.CompletedProcess:
        return subprocess.run(shell, capture_output=True, text=True, timeout=TOOL_TIMEOUT, cwd=str(Path.home()),
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        p = await asyncio.to_thread(go)
    except subprocess.TimeoutExpired:
        return ToolResult("Error: command timed out after 60 seconds", "Command timed out", ok=False)
    out = ((p.stdout or "") + (("\n[stderr]\n" + p.stderr) if p.stderr else ""))[-8000:]
    return ToolResult(f"Exit code {p.returncode}\n{out}", f"Exit code {p.returncode}", ok=p.returncode == 0)


TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("calculator", "Calculating", "Evaluate an arithmetic expression exactly (supports + - * / ** % sqrt log sin cos pi e).",
         _obj({"expression": {"type": "string", "description": "e.g. (1234*5678)/3"}}, ["expression"]), _calc,
         describe=lambda a: str(a.get("expression", ""))),
    Tool("get_current_datetime", "Checking the date", "Get the current local date and time.", _obj({}, []), _now),
    Tool("web_search", "Searching the web",
         "Search the web for current or factual information. Returns numbered results with URLs; cite them as [n].",
         _obj({"query": {"type": "string"}, "max_results": {"type": "integer", "minimum": 1, "maximum": 8}}, ["query"]), _search,
         needs_approval=lambda a, c: c.private, available=lambda c: c.web_enabled, describe=lambda a: str(a.get("query", ""))),
    Tool("fetch_url", "Reading a web page", "Fetch a public web page and return its main text.",
         _obj({"url": {"type": "string", "description": "http(s) URL"}}, ["url"]), _fetch,
         needs_approval=lambda a, c: c.private, available=lambda c: c.web_enabled, describe=lambda a: str(a.get("url", ""))),
    Tool("save_file", "Saving a file", "Save text content as a file in the user's Documents\\FRIDAY folder. Requires the user's approval.",
         _obj({"filename": {"type": "string"}, "content": {"type": "string"}}, ["filename", "content"]), _save,
         needs_approval=lambda a, c: True, describe=lambda a: str(a.get("filename", ""))),
    Tool("open_url", "Opening a link", "Open a web link in the user's default browser. Requires the user's approval.",
         _obj({"url": {"type": "string"}}, ["url"]), _open, needs_approval=lambda a, c: True, describe=lambda a: str(a.get("url", ""))),
    Tool("run_command", "Running a command",
         "Run a PowerShell command on the user's PC and return its output. Requires the user's approval every time. "
         "Only use when the user asks for something that genuinely needs it.",
         _obj({"command": {"type": "string"}}, ["command"]), _command,
         needs_approval=lambda a, c: True, available=lambda c: c.allow_commands, describe=lambda a: str(a.get("command", ""))),
]}


def available_tools(ctx: ToolContext) -> list[Tool]:
    return [t for t in TOOLS.values() if t.available(ctx)]


def parse_args(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        import json
        try:
            v = json.loads(raw or "{}")
            return v if isinstance(v, dict) else {}
        except ValueError:
            return {}
    return {}
