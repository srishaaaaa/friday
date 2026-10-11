import asyncio

from app.providers.base import ProviderError
from tests.conftest import parse_sse


async def _prefs(client, **kw):
    base = {"ollama_model": "llama3", "default_mode": "local"}
    base.update(kw)
    await client.patch("/api/settings", json=base)


async def test_stream_events_and_persistence(client, providers):
    await _prefs(client)
    r = await client.post("/api/chat/stream", json={"request_id": "req-00000001", "message": "hi"})
    assert r.headers["content-type"].startswith("text/event-stream")
    ev = parse_sse(r.text)
    assert [e for e, _ in ev] == ["meta", "delta", "delta", "done"]
    assert ev[0][1]["provider"] == "ollama" and ev[0][1]["leaves_device"] is False
    assert ev[-1][1]["status"] == "ok" and ev[-1][1]["usage"]["output_tokens"] == 2
    conv = (await client.get(f"/api/conversations/{ev[0][1]['conversation_id']}")).json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant"]
    assert conv["messages"][1]["model"] == "llama3"


async def test_multi_turn_context_is_sent(client, providers):
    await _prefs(client)
    r1 = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-00000002", "message": "one"})).text)
    cid = r1[0][1]["conversation_id"]
    await client.post("/api/chat/stream", json={"request_id": "req-00000003", "message": "two", "conversation_id": cid})
    sent, _ = providers["ollama"].calls[-1]
    assert [(m.role, m.content) for m in sent] == [("user", "one"), ("assistant", "Hello world"), ("user", "two")]


async def test_local_mode_never_falls_back_to_cloud(client, providers):
    await _prefs(client)
    providers["ollama"].error = ProviderError("provider_unavailable", "Ollama is not reachable.", retryable=True)
    r = await client.post("/api/chat/stream", json={"request_id": "req-00000004", "message": "hi"})
    ev = parse_sse(r.text)
    assert ev[1][0] == "error" and ev[1][1]["code"] == "provider_unavailable" and ev[1][1]["retryable"]
    assert providers["anthropic"].calls == []  # nothing was sent to the hosted provider


async def test_smart_mode_failure_does_not_escape_to_cloud(client, providers):
    await _prefs(client, default_mode="smart")
    providers["ollama"].error = ProviderError("provider_unavailable", "down", retryable=True)
    r = await client.post("/api/chat/stream", json={"request_id": "req-00000005", "message": "hello there"})
    assert parse_sse(r.text)[1][0] == "error"
    assert providers["anthropic"].calls == []


async def test_cancel_mid_stream_keeps_partial(client, providers):
    await _prefs(client)
    providers["ollama"].hang = True
    task = asyncio.create_task(client.post("/api/chat/stream", json={"request_id": "req-00000006", "message": "slow"}))
    await asyncio.sleep(0.3)
    assert (await client.post("/api/chat/cancel", json={"request_id": "req-00000006"})).json()["cancelled"] is True
    ev = parse_sse((await asyncio.wait_for(task, 5)).text)
    assert ev[-1][1]["status"] == "cancelled"
    conv = (await client.get(f"/api/conversations/{ev[0][1]['conversation_id']}")).json()
    assert conv["messages"][-1]["content"] == "Hello" and conv["messages"][-1]["status"] == "cancelled"


async def test_regenerate_replaces_last_assistant_message(client, providers):
    await _prefs(client)
    ev = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-00000007", "message": "q"})).text)
    cid = ev[0][1]["conversation_id"]
    providers["ollama"].chunks = ["Second", " try"]
    await client.post("/api/chat/stream", json={"request_id": "req-00000008", "conversation_id": cid, "regenerate": True})
    msgs = (await client.get(f"/api/conversations/{cid}")).json()["messages"]
    assert [m["content"] for m in msgs] == ["q", "Second try"]


async def test_empty_response_is_reported(client, providers):
    await _prefs(client)
    providers["ollama"].chunks = []
    ev = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-00000009", "message": "x"})).text)
    assert any(e == "error" and d["code"] == "empty_response" for e, d in ev)


async def test_validation_errors_are_json_and_do_not_create_conversations(client):
    await _prefs(client)
    r = await client.post("/api/chat/stream", json={"request_id": "req-0000000a", "message": "   "})
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_message"
    r = await client.post("/api/chat/stream", json={"request_id": "req-0000000b", "message": "x",
                                                      "conversation_id": "nope"})
    assert r.status_code == 404
    assert (await client.get("/api/conversations")).json() == []
