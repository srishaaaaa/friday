"""Tool calling: agent loop, approvals, web search sources, safety guards and OCR."""
import asyncio
import base64
import io

import httpx
import pytest

from app.providers.base import ProviderError, ToolCall
from app.services import ocr, websearch
from app.services.attachments import extract
from app.services.tools import safe_eval
from tests.conftest import HEADERS, parse_sse


async def _prefs(client, **kw):
    r = await client.patch("/api/settings", json={"ollama_model": "llama3", "default_mode": "local", **kw})
    assert r.status_code == 200, r.text


def _events(ev, name):
    return [d for e, d in ev if e == name]


async def test_calculator_round_trip_and_persistence(client, providers):
    await _prefs(client)
    providers["ollama"].script = [("calls", [ToolCall("c1", "calculator", {"expression": "1234*5678"})]),
                                  ("text", ["The answer is 7006652."])]
    ev = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-tool-001", "message": "1234*5678?"})).text)
    assert _events(ev, "tool_start")[0]["name"] == "calculator"
    res = _events(ev, "tool_result")[0]
    assert res["ok"] and res["summary"] == "1234*5678 = 7006652"
    names = [t["name"] for t in providers["ollama"].last_tools]
    assert "calculator" in names and "run_command" not in names  # commands are off by default
    sent, _ = providers["ollama"].calls[-1]
    assert sent[-1].role == "tool" and "7006652" in sent[-1].content and sent[-2].tool_calls[0].name == "calculator"
    conv = (await client.get(f"/api/conversations/{ev[0][1]['conversation_id']}")).json()
    reply = conv["messages"][-1]
    assert reply["content"] == "The answer is 7006652." and reply["tools"][0]["name"] == "calculator"


async def _stream_with_answer(client, app, body, call_id, answer):
    async def approver():
        for _ in range(200):
            if (body["request_id"], call_id) in app.state.chat._approvals:
                r = await client.post("/api/chat/approve", json={"request_id": body["request_id"], "call_id": call_id, "approve": answer})
                assert r.status_code == 200
                return
            await asyncio.sleep(0.02)
        raise AssertionError("no approval was requested")
    resp, _ = await asyncio.gather(client.post("/api/chat/stream", json=body), approver())
    return parse_sse(resp.text)


async def test_actions_need_approval_and_respect_a_decline(client, providers, app, tmp_path):
    await _prefs(client)
    app.state.chat.files_dir = tmp_path / "out"
    save = ToolCall("s1", "save_file", {"filename": "notes.md", "content": "# hi"})
    providers["ollama"].script = [("calls", [save]), ("text", ["Saved it."])]
    ev = await _stream_with_answer(client, app, {"request_id": "req-tool-002", "message": "save notes"}, "s1", True)
    assert _events(ev, "tool_request")[0]["name"] == "save_file"
    assert (tmp_path / "out" / "notes.md").read_text() == "# hi"

    providers["ollama"].script = [("calls", [ToolCall("s2", "save_file", {"filename": "x.txt", "content": "no"})]), ("text", ["OK, not saved."])]
    ev = await _stream_with_answer(client, app, {"request_id": "req-tool-003", "message": "save x"}, "s2", False)
    res = _events(ev, "tool_result")[0]
    assert res["ok"] is False and res["summary"] == "Declined by you"
    assert not (tmp_path / "out" / "x.txt").exists()
    sent, _ = providers["ollama"].calls[-1]
    assert "declined" in sent[-1].content


async def test_web_search_returns_numbered_sources(client, providers, monkeypatch):
    await _prefs(client)

    async def fake_ddg(q, n=5, transport=None):
        return [websearch.SearchResult("Gemma 4 release", "https://example.com/gemma4", "Released in 2026"),
                websearch.SearchResult("Ollama blog", "https://ollama.com/blog", "Gemma 4 on Ollama")]
    monkeypatch.setattr(websearch, "duckduckgo", fake_ddg)
    providers["ollama"].script = [("calls", [ToolCall("w1", "web_search", {"query": "gemma 4 release"})]), ("text", ["Gemma 4 came out in 2026 [1]."])]
    ev = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-tool-004", "message": "latest news on gemma 4"})).text)
    res = _events(ev, "tool_result")[0]
    assert [s["n"] for s in res["sources"]] == [1, 2] and res["sources"][0]["url"] == "https://example.com/gemma4"
    assert "web_search" in providers["ollama"].last_system and "[1]" in providers["ollama"].last_system
    conv = (await client.get(f"/api/conversations/{ev[0][1]['conversation_id']}")).json()
    assert conv["messages"][-1]["sources"][1]["title"] == "Ollama blog"


async def test_web_tools_need_approval_with_private_content_and_can_be_disabled(client, providers, app):
    await _prefs(client)
    up = (await client.post("/api/attachments", json={"name": "a.txt", "data_b64": base64.b64encode(b"secret plan").decode()})).json()
    providers["ollama"].script = [("calls", [ToolCall("w2", "web_search", {"query": "secret plan"})]), ("text", ["Done without searching."])]
    ev = await _stream_with_answer(client, app, {"request_id": "req-tool-005", "message": "research this", "attachment_ids": [up["id"]]}, "w2", False)
    assert _events(ev, "tool_request")[0]["private"] is True
    await _prefs(client, web_search=False)
    providers["ollama"].script = [("text", ["no tools"])]
    await client.post("/api/chat/stream", json={"request_id": "req-tool-006", "message": "hi"})
    assert "web_search" not in [t["name"] for t in providers["ollama"].last_tools]
    await _prefs(client, tools_enabled=False)
    providers["ollama"].script = [("text", ["no tools"])]
    await client.post("/api/chat/stream", json={"request_id": "req-tool-007", "message": "hi"})
    assert providers["ollama"].last_tools is None


async def test_model_without_tool_support_still_answers(client, providers):
    await _prefs(client)
    providers["ollama"].script = [("error", ProviderError("tools_unsupported", "no tools")), ("text", ["Plain answer."])]
    ev = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-tool-008", "message": "hi"})).text)
    assert any("can't use tools" in d["text"] for d in _events(ev, "status"))
    assert ev[-1][1]["status"] == "ok" and providers["ollama"].last_tools is None


async def test_unknown_or_unoffered_tool_is_refused(client, providers):
    await _prefs(client)
    providers["ollama"].script = [("calls", [ToolCall("r1", "run_command", {"command": "del *"})]), ("text", ["ok"])]
    ev = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-tool-009", "message": "x"})).text)
    assert _events(ev, "tool_request") == [] and _events(ev, "tool_result")[0]["ok"] is False


def test_calculator_is_arithmetic_only():
    assert safe_eval("2**10 + sqrt(16)") == 1028
    for bad in ("__import__('os').system('x')", "().__class__", "open('f')", "9**99999"):
        with pytest.raises((ValueError, SyntaxError)):
            safe_eval(bad)


async def test_fetch_refuses_local_and_private_addresses():
    for url in ("http://127.0.0.1:8765/api/settings", "http://localhost/", "http://10.0.0.5/", "file:///C:/Windows/win.ini", "http://169.254.169.254/"):
        with pytest.raises(websearch.WebError):
            await websearch.check_public_url(url)


async def test_duckduckgo_parsing():
    page = ('<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=x">Example &amp; Co</a>'
            '<a class="result__snippet" href="#">An <b>example</b> snippet</a>'
            '<a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a>')
    t = httpx.MockTransport(lambda req: httpx.Response(200, text=page))
    res = await websearch.duckduckgo("q", 5, transport=t)
    assert [(r.title, r.url, r.snippet) for r in res] == [("Example & Co", "https://example.com/a", "An example snippet")]


@pytest.mark.skipif(not ocr.available(), reason="Windows OCR not available")
def test_scanned_pdf_is_read_with_ocr():
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (1200, 400), "white")
    try:
        font = ImageFont.truetype("arial.ttf", 56)
    except OSError:
        font = ImageFont.load_default()
    ImageDraw.Draw(img).text((40, 150), "Scanned contract number 77341", fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, "PDF")  # image-only PDF: no text layer, like a scan
    ex = extract("scan.pdf", "application/pdf", base64.b64encode(buf.getvalue()).decode())
    assert ex.ocr and "77341" in ex.text and ex.pages == 1
