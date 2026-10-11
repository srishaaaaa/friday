import httpx

from app.core.config import Settings
from tests.conftest import HEADERS, parse_sse


async def test_health_open_but_api_requires_token(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        assert (await c.get("/health")).json()["status"] == "ok"
        assert (await c.get("/api/conversations")).status_code == 401
        assert (await c.get("/api/conversations", headers={"x-friday-token": "wrong"})).status_code == 401
        assert (await c.get("/api/conversations", headers=HEADERS)).status_code == 200


async def test_settings_roundtrip_and_validation(client):
    r = await client.patch("/api/settings", json={"default_mode": "local", "ollama_model": "llama3"})
    assert r.json()["default_mode"] == "local"
    assert (await client.get("/api/settings")).json()["ollama_model"] == "llama3"
    assert (await client.patch("/api/settings", json={"max_tokens": 1})).status_code == 422


async def test_api_key_never_returned_or_stored_in_db(client, app):
    secret = "sk-ant-very-secret-key-123456"
    r = await client.put("/api/providers/anthropic/key", json={"api_key": secret})
    assert r.json()["configured"] is True
    for path in ("/api/settings", "/api/providers/status", "/api/models"):
        assert secret not in (await client.get(path)).text
    db_bytes = app.state.settings.db_path.read_bytes()
    assert secret.encode() not in db_bytes
    await client.delete("/api/providers/anthropic/key")
    assert app.state.secrets.get("anthropic_api_key") is None


async def test_conversation_crud_search_export_and_delete_all(client, providers):
    await client.patch("/api/settings", json={"ollama_model": "m1", "default_mode": "local"})
    rid = "req-aaaaaaaa"
    r = await client.post("/api/chat/stream", json={"request_id": rid, "message": "Tell me about zebras"})
    conv_id = parse_sse(r.text)[0][1]["conversation_id"]
    assert (await client.get("/api/conversations", params={"q": "zebras"})).json()[0]["id"] == conv_id
    assert (await client.get("/api/conversations", params={"q": "nonexistent"})).json() == []
    assert (await client.get("/api/conversations", params={"q": "%"})).json() == []  # wildcard is escaped
    assert (await client.patch(f"/api/conversations/{conv_id}", json={"title": "Zoo"})).status_code == 200
    md = (await client.get(f"/api/conversations/{conv_id}/export", params={"format": "md"})).text
    assert md.startswith("# Zoo") and "Hello world" in md
    assert (await client.delete(f"/api/conversations/{conv_id}")).status_code == 200
    assert (await client.get(f"/api/conversations/{conv_id}")).status_code == 404
    await client.post("/api/conversations", json={"title": "x"})
    assert (await client.delete("/api/conversations")).json()["deleted"] == 1


async def test_persistence_across_restart(make_app, tmp_path, providers):
    app1 = make_app(tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app1), base_url="http://t", headers=HEADERS) as c:
        await c.patch("/api/settings", json={"ollama_model": "m1", "default_mode": "local"})
        r = await c.post("/api/chat/stream", json={"request_id": "req-persist1", "message": "remember me"})
        conv_id = parse_sse(r.text)[0][1]["conversation_id"]
    app1.state.engine.dispose()
    app2 = make_app(tmp_path)  # new process-equivalent, same data dir
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app2), base_url="http://t", headers=HEADERS) as c:
        conv = (await c.get(f"/api/conversations/{conv_id}")).json()
        assert [m["content"] for m in conv["messages"]] == ["remember me", "Hello world"]
        assert (await c.get("/api/settings")).json()["ollama_model"] == "m1"


def test_corrupt_database_is_moved_aside(tmp_path):
    from app.database.session import open_database
    db = tmp_path / "friday.db"
    db.write_bytes(b"this is not a sqlite database" * 50)
    open_database(db)
    assert any(p.name.startswith("friday.corrupt-") for p in tmp_path.iterdir())
