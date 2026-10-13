"""Memory, attachments, personality/generation settings, edit, feedback, archive and Ollama-cloud routing."""
import base64
import io
import zipfile

import pytest

from app.core.errors import AppError
from app.providers.base import ProviderError
from app.services.attachments import extract
from app.services.prompting import DEFAULT_SYSTEM_PROMPT, LEGACY_SYSTEM_PROMPT, detect_intent
from tests.conftest import parse_sse
from tests.test_routing import route

b64 = lambda raw: base64.b64encode(raw).decode()  # noqa: E731


async def _prefs(client, **kw):
    base = {"ollama_model": "llama3", "default_mode": "local"}
    base.update(kw)
    r = await client.patch("/api/settings", json=base)
    assert r.status_code == 200, r.text


async def _send(client, rid, **body):
    return parse_sse((await client.post("/api/chat/stream", json={"request_id": rid, **body})).text)


# ---------------------------------------------------------------- routing: Ollama cloud models
def test_ollama_cloud_model_is_reported_as_leaving_device():
    r = route("local", local="gemma4:cloud")
    assert r.provider_id == "ollama" and r.leaves_device
    assert not route("local", local="gemma4:e2b").leaves_device
    assert route("smart", local="gpt-oss:120b-cloud").leaves_device


def test_private_content_never_silently_goes_to_ollama_cloud():
    for mode in ("local", "smart"):
        with pytest.raises(AppError) as e:
            route(mode, local="gemma4:cloud", private=True, cloud=False)
        assert e.value.code == "confirmation_required"
    assert route("smart", local="gemma4:cloud", private=True, confirm=True, cloud=False).leaves_device
    on_device = route("smart", local="gemma4:e2b", private=True)
    assert on_device.provider_id == "ollama" and not on_device.leaves_device


# ---------------------------------------------------------------- attachments
def _docx(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", f'<w:document><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>')
    return buf.getvalue()


def test_extraction_by_type():
    assert extract("notes.md", "text/markdown", b64(b"# Hi\nthere")).text == "# Hi\nthere"
    assert extract("a.docx", "", b64(_docx("Hello &amp; bye"))).text == "Hello & bye"
    img = extract("p.png", "image/png", b64(b"\x89PNG fake"))
    assert img.kind == "image" and img.data_b64
    for name, raw, code in [("x.exe", b"MZ", "unsupported_file"), ("e.txt", b"", "bad_upload"),
                            ("bin.txt", b"\x00\x01\x02" * 50, "unsupported_file")]:
        with pytest.raises(AppError) as e:
            extract(name, "", b64(raw) if raw else "")
        assert e.value.code in (code, "empty_file", "bad_upload")
    big = extract("big.txt", "text/plain", b64(b"a" * 70_000))
    assert big.truncated and len(big.text) == 60_000


async def test_attachment_flow_is_private_and_reaches_the_model(client, providers):
    await _prefs(client)
    up = (await client.post("/api/attachments", json={"name": "plan.txt", "mime": "text/plain",
                                                       "data_b64": b64(b"secret launch date: May 3")})).json()
    assert up["kind"] == "text" and up["chars"] > 0 and up["sent"] is False
    ev = await _send(client, "req-att-0001", message="When is launch?", attachment_ids=[up["id"]])
    meta = ev[0][1]
    assert meta["leaves_device"] is False and "Reading 1 attached file" in meta["activity"]
    sent, _ = providers["ollama"].calls[-1]
    assert "secret launch date: May 3" in sent[-1].content and "When is launch?" in sent[-1].content
    conv = (await client.get(f"/api/conversations/{meta['conversation_id']}")).json()
    assert conv["messages"][0]["attachments"][0]["name"] == "plan.txt"
    # already sent → cannot be deleted individually or reused
    assert (await client.delete(f"/api/attachments/{up['id']}")).status_code == 404
    r = await client.post("/api/chat/stream", json={"request_id": "req-att-0002", "message": "again", "attachment_ids": [up["id"]]})
    assert r.status_code == 409


async def test_attachment_with_cloud_mode_requires_confirmation(client, providers, app):
    app.state.secrets.set("anthropic_api_key", "sk-test-123456")
    await _prefs(client, default_mode="cloud")
    up = (await client.post("/api/attachments", json={"name": "a.txt", "data_b64": b64(b"private")})).json()
    r = await client.post("/api/chat/stream", json={"request_id": "req-att-0003", "message": "x", "attachment_ids": [up["id"]]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "confirmation_required"
    assert providers["anthropic"].calls == []  # nothing was sent
    ev = await _send(client, "req-att-0004", message="x", attachment_ids=[up["id"]], confirm_cloud=True)
    assert ev[0][1]["provider"] == "anthropic" and ev[0][1]["leaves_device"]


async def test_image_attachment_is_passed_as_vision_input(client, providers):
    await _prefs(client)
    up = (await client.post("/api/attachments", json={"name": "cat.png", "data_b64": b64(b"\x89PNGdata")})).json()
    await _send(client, "req-img-0001", message="", attachment_ids=[up["id"]])
    sent, _ = providers["ollama"].calls[-1]
    assert sent[-1].images and sent[-1].images[0][0] == "image/png"
    assert sent[-1].content == "Please review the attached file(s)."


async def test_unsent_attachment_can_be_removed(client):
    up = (await client.post("/api/attachments", json={"name": "a.txt", "data_b64": b64(b"x")})).json()
    assert (await client.delete(f"/api/attachments/{up['id']}")).status_code == 200
    assert (await client.get(f"/api/attachments/{up['id']}")).status_code == 404


# ---------------------------------------------------------------- memory
async def test_memory_crud_and_effect_on_prompt(client, providers):
    await _prefs(client)
    m = (await client.post("/api/memories", json={"content": "I prefer metric units"})).json()
    off = (await client.post("/api/memories", json={"content": "Disabled fact"})).json()
    await client.patch(f"/api/memories/{off['id']}", json={"enabled": False})
    assert len((await client.get("/api/memories", params={"q": "metric"})).json()) == 1

    ev = await _send(client, "req-mem-0001", message="hello there friend")
    assert providers["ollama"].last_system and "I prefer metric units" in providers["ollama"].last_system
    assert "Disabled fact" not in providers["ollama"].last_system
    assert "Using 1 saved memory" in ev[0][1]["activity"]

    await _prefs(client, memory_enabled=False)
    await _send(client, "req-mem-0002", message="hello again friend")
    assert "I prefer metric units" not in providers["ollama"].last_system

    await client.delete(f"/api/memories/{m['id']}")
    assert (await client.delete("/api/memories")).json()["deleted"] == 1
    assert (await client.get("/api/memories")).json() == []


# ---------------------------------------------------------------- personality & generation settings
async def test_personality_and_generation_settings_change_the_request(client, providers):
    await _prefs(client, personality="concise", humor="off", nickname="Sri", custom_instructions="Answer in British English.",
                 temperature=0.3, top_p=0.9, context_window=8192, request_timeout=60)
    await _send(client, "req-per-0001", message="Compare tea vs coffee")
    sysmsg, opts = providers["ollama"].last_system, providers["ollama"].last_options
    assert sysmsg.startswith(DEFAULT_SYSTEM_PROMPT[:60])
    assert "Personality: concise" in sysmsg and "Do not use humor" in sysmsg
    assert '"Sri"' in sysmsg and "British English" in sysmsg
    # per-message guidance rides on the user turn, so the system prompt stays cacheable
    sent, _ = providers["ollama"].calls[-1]
    assert "Response guidance:" in sent[-1].content and "table" in sent[-1].content and "For this message" not in sysmsg
    assert opts == {"timeout": 60.0, "temperature": 0.3, "top_p": 0.9, "num_ctx": 8192, "think": False, "keep_alive": "30m"}
    await _send(client, "req-per-0002", message="hello again, how are you")
    assert providers["ollama"].last_system == sysmsg  # identical prefix across different kinds of message
    await _prefs(client, reasoning=True, keep_alive_minutes=120)
    await _send(client, "req-per-0003", message="hi")
    assert "think" not in providers["ollama"].last_options and providers["ollama"].last_options["keep_alive"] == "120m"
    # nullable settings can be reset to the model default
    await client.patch("/api/settings", json={"temperature": None})
    assert (await client.get("/api/settings")).json()["temperature"] is None
    assert (await client.patch("/api/settings", json={"temperature": 5})).status_code == 422


def test_intent_detection():
    assert detect_intent("hi!") == "greeting"
    assert detect_intent("I'm so stressed about exams") == "emotional"
    assert detect_intent("my script throws a TypeError") == "troubleshooting"
    assert detect_intent("rust vs go for a CLI?") == "comparison"
    assert detect_intent("explain how DNS works") == "learning"
    assert detect_intent("What is the capital of Peru?") in ("learning", "factual")


async def test_legacy_default_prompt_is_upgraded(app):
    repo = app.state.repo
    s = repo.get_settings().model_copy(update={"system_prompt": LEGACY_SYSTEM_PROMPT})
    repo.save_settings(s)
    assert repo.get_settings().system_prompt == DEFAULT_SYSTEM_PROMPT
    # user additions to the old default survive as custom instructions
    repo.save_settings(s.model_copy(update={"system_prompt": LEGACY_SYSTEM_PROMPT + " call me sunshine"}))
    upgraded = repo.get_settings()
    assert upgraded.system_prompt == DEFAULT_SYSTEM_PROMPT and upgraded.custom_instructions == "call me sunshine"


async def test_conversation_memory_off_sends_only_latest_turn(client, providers):
    await _prefs(client, conversation_memory=False)
    ev = await _send(client, "req-cm-00001", message="one")
    await _send(client, "req-cm-00002", message="two", conversation_id=ev[0][1]["conversation_id"])
    sent, _ = providers["ollama"].calls[-1]
    assert [m.content for m in sent] == ["two"]


async def test_auto_retry_uses_same_provider_once(client, providers):
    await _prefs(client, auto_retry=True)
    calls = {"n": 0}
    orig = providers["ollama"].stream

    async def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ProviderError("timeout", "slow", retryable=True)
        async for c in orig(*a, **k):
            yield c
    providers["ollama"].stream = flaky
    ev = await _send(client, "req-rt-00001", message="hi")
    assert calls["n"] == 2 and ev[-1][1]["status"] == "ok" and ("status" in [e for e, _ in ev])
    assert providers["anthropic"].calls == []


# ---------------------------------------------------------------- edit, feedback, archive
async def test_edit_last_message_feedback_and_archive(client, providers):
    await _prefs(client)
    ev = await _send(client, "req-ed-00001", message="first question")
    cid = ev[0][1]["conversation_id"]
    await _send(client, "req-ed-00002", message="edited question", conversation_id=cid, edit=True)
    conv = (await client.get(f"/api/conversations/{cid}")).json()
    assert [(m["role"], m["content"]) for m in conv["messages"]] == [("user", "edited question"), ("assistant", "Hello world")]

    aid = conv["messages"][1]["id"]
    assert (await client.put(f"/api/messages/{aid}/feedback", json={"value": "up"})).status_code == 200
    assert (await client.get(f"/api/conversations/{cid}")).json()["messages"][1]["feedback"] == "up"
    assert (await client.put(f"/api/messages/{conv['messages'][0]['id']}/feedback", json={"value": "up"})).status_code == 404

    await client.patch(f"/api/conversations/{cid}", json={"archived": True})
    assert all(c["id"] != cid for c in (await client.get("/api/conversations")).json())
    assert any(c["id"] == cid for c in (await client.get("/api/conversations", params={"archived": True})).json())
