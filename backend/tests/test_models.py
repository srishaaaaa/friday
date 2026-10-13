"""Model discovery from Ollama /api/tags and real-generation verification."""
import json

import httpx

from app.providers.base import ProviderError
from app.providers.ollama import OllamaProvider

TAGS = {"models": [
    {"name": "gemma4:cloud", "model": "gemma4:cloud", "remote_model": "gemma4:31b", "remote_host": "https://ollama.com", "size": 312,
     "details": {"family": "", "parameter_size": "32.7B", "quantization_level": "BF16", "context_length": 262144},
     "capabilities": ["completion", "thinking", "tools", "vision"]},
    {"name": "qwen2.5-coder:latest", "size": 4683087561,
     "details": {"family": "qwen2", "parameter_size": "7.6B", "quantization_level": "Q4_K_M", "context_length": 32768},
     "capabilities": ["completion", "tools", "insert"]},
    {"name": "nomic-embed-text:latest", "size": 274302450, "details": {"family": "nomic-bert", "parameter_size": "137M"},
     "capabilities": ["embedding"]},
    {"name": "old-model:7b", "size": 100, "details": {}},  # older Ollama: no capabilities reported
]}


def _ollama(handler) -> OllamaProvider:
    return OllamaProvider("http://ollama.test", transport=httpx.MockTransport(handler))


async def test_discovery_keeps_exact_ids_and_metadata():
    p = _ollama(lambda req: httpx.Response(200, json=TAGS))
    models = {m.id: m for m in await p.list_models()}
    assert list(models) == ["gemma4:cloud", "qwen2.5-coder:latest", "nomic-embed-text:latest", "old-model:7b"]
    cloud, coder, embed, old = models.values()
    assert cloud.remote and cloud.remote_model == "gemma4:31b" and cloud.supports_vision and cloud.context_length == 262144
    assert not coder.remote and coder.parameter_size == "7.6B" and coder.quantization == "Q4_K_M" and coder.size == 4683087561
    assert coder.can_chat and not embed.can_chat and old.can_chat and old.capabilities is None


async def test_models_endpoint_reports_metadata(client, providers):
    r = (await client.get("/api/models")).json()
    m = r["ollama"]["models"][0]
    assert m["id"] == "m1" and "can_chat" in m and "capabilities" in m


async def test_verify_generates_a_real_reply(client, providers):
    providers["ollama"].chunks = ["Ready", "."]
    r = (await client.post("/api/models/verify", json={"provider": "ollama", "model": "m1"})).json()
    assert r["ok"] and r["sample"] == "Ready." and r["latency_ms"] is not None and r["first_token_ms"] is not None
    sent, model = providers["ollama"].calls[-1]
    assert model == "m1" and "ready" in sent[0].content.lower()


async def test_verify_reports_missing_model_without_installing(client, providers):
    r = (await client.post("/api/models/verify", json={"provider": "ollama", "model": "llama9:404b"})).json()
    assert not r["ok"] and r["error"]["code"] == "model_not_found" and "ollama pull llama9:404b" in r["error"]["message"]
    assert providers["ollama"].calls == []  # nothing was sent to the model


async def test_verify_reports_provider_errors(client, providers):
    providers["ollama"].error = ProviderError("timeout", "Ollama took too long to respond.", retryable=True)
    r = (await client.post("/api/models/verify", json={"provider": "ollama", "model": "m1"})).json()
    assert not r["ok"] and r["error"] == {"code": "timeout", "message": "Ollama took too long to respond."}
    assert (await client.post("/api/models/verify", json={"provider": "nope", "model": "x"})).status_code == 404


async def test_ollama_turns_off_thinking_only_when_asked():
    seen = {}

    def handler(req: httpx.Request):
        seen.update(json.loads(req.content))
        return httpx.Response(200, text=json.dumps({"message": {"content": "ready"}, "done": True}) + "\n")
    p = _ollama(handler)
    [c async for c in p.stream([], "deepseek-r1:8b", None, 16, options={"think": False})]
    assert seen["think"] is False
    seen.clear()
    [c async for c in p.stream([], "llama3.2:latest", None, 16)]
    assert "think" not in seen


async def test_reasoning_that_exhausts_the_budget_is_explained():
    lines = [{"message": {"thinking": "hmm, let me think"}, "done": False},
             {"message": {"thinking": " more"}, "done": True, "done_reason": "length"}]
    p = _ollama(lambda req: httpx.Response(200, text="".join(json.dumps(x) + "\n" for x in lines)))
    try:
        [c async for c in p.stream([], "deepseek-r1:8b", None, 64)]
        raise AssertionError("expected ProviderError")
    except ProviderError as exc:
        assert exc.code == "reasoning_budget" and "Maximum response length" in exc.message


async def test_reply_timing_is_recorded(client, providers):
    r = await client.patch("/api/settings", json={"ollama_model": "llama3", "default_mode": "local"})
    assert r.status_code == 200
    from tests.conftest import parse_sse
    ev = parse_sse((await client.post("/api/chat/stream", json={"request_id": "req-time-0001", "message": "hi"})).text)
    usage = ev[-1][1]["usage"]
    assert usage["first_token_ms"] is not None and usage["total_ms"] >= usage["first_token_ms"]


async def test_warmup_uses_the_same_prompt_as_real_requests(client, providers, app):
    await client.patch("/api/settings", json={"ollama_model": "llama3", "default_mode": "local"})
    res = await app.state.chat.warmup()
    assert res["warmed"] and providers["ollama"].last_options["keep_alive"] == "30m"
    warm_system = providers["ollama"].last_system
    await client.post("/api/chat/stream", json={"request_id": "req-warm-0001", "message": "hello"})
    assert providers["ollama"].last_system == warm_system  # same prefix -> Ollama's prompt cache is reused
    await client.patch("/api/settings", json={"ollama_model": "gemma4:cloud"})
    assert (await app.state.chat.warmup())["warmed"] is False  # cloud models need no warm-up
