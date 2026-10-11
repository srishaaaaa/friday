import json

import httpx
import pytest

from app.providers.base import ChatMessage, ProviderError
from app.providers.hosted import AnthropicProvider
from app.providers.ollama import OllamaProvider

MSGS = [ChatMessage("user", "hi")]


async def collect(p, model="m"):
    return [c async for c in p.stream(MSGS, model, "sys", 100)]


def ndjson(*objs):
    return "\n".join(json.dumps(o) for o in objs).encode()


async def test_ollama_streams_and_reports_usage():
    body = ndjson({"message": {"content": "Hel"}, "done": False}, {"message": {"content": "lo"}, "done": False},
                  {"done": True, "prompt_eval_count": 5, "eval_count": 2})
    p = OllamaProvider("http://x", transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body)))
    out = await collect(p)
    assert "".join(c.text for c in out if c.kind == "delta") == "Hello"
    assert out[-1].usage == {"input_tokens": 5, "output_tokens": 2}


async def test_ollama_model_not_found_and_unreachable():
    p = OllamaProvider("http://x", transport=httpx.MockTransport(lambda r: httpx.Response(404, json={"error": "nope"})))
    with pytest.raises(ProviderError) as e:
        await collect(p, "ghost")
    assert e.value.code == "model_not_found" and "ollama pull ghost" in e.value.message

    def boom(request):
        raise httpx.ConnectError("refused")
    p = OllamaProvider("http://x", transport=httpx.MockTransport(boom))
    with pytest.raises(ProviderError) as e:
        await collect(p)
    assert e.value.code == "provider_unavailable" and e.value.retryable
    assert (await p.status()).available is False


async def test_ollama_lists_models():
    t = httpx.MockTransport(lambda r: httpx.Response(200, json={"models": [{"name": "llama3:8b"}]}))
    assert [m.id for m in await OllamaProvider("http://x", transport=t).list_models()] == ["llama3:8b"]


def sse_body(*events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def anthropic(handler, key="sk-test-key-0000"):
    return AnthropicProvider("http://api", lambda: key, transport=httpx.MockTransport(handler))


async def test_anthropic_stream_parses_deltas_and_usage():
    seen = {}

    def handler(req):
        seen["key"], seen["body"] = req.headers["x-api-key"], json.loads(req.content)
        return httpx.Response(200, content=sse_body(
            {"type": "message_start", "message": {"usage": {"input_tokens": 7}}},
            {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hi"}},
            {"type": "content_block_delta", "delta": {"type": "text_delta", "text": " there"}},
            {"type": "message_delta", "usage": {"output_tokens": 4}},
            {"type": "message_stop"}))
    out = await collect(anthropic(handler), "claude-x")
    assert "".join(c.text for c in out if c.kind == "delta") == "Hi there"
    assert out[-1].usage == {"input_tokens": 7, "output_tokens": 4}
    assert seen["key"] == "sk-test-key-0000" and seen["body"]["stream"] is True and seen["body"]["system"] == "sys"


@pytest.mark.parametrize("status,payload,code,retryable", [
    (401, {"error": {"message": "bad key"}}, "auth_error", False),
    (429, {"error": {"message": "slow down"}}, "rate_limited", True),
    (400, {"error": {"message": "prompt is too long: 300000 tokens"}}, "context_length", False),
    (503, {"error": {"message": "x"}}, "provider_error", True),
])
async def test_anthropic_error_mapping(status, payload, code, retryable):
    with pytest.raises(ProviderError) as e:
        await collect(anthropic(lambda r: httpx.Response(status, json=payload)))
    assert e.value.code == code and e.value.retryable is retryable
    assert "sk-test-key" not in e.value.message


async def test_anthropic_without_key_reports_not_configured():
    p = AnthropicProvider("http://api", lambda: None)
    assert p.configured is False
    assert (await p.status()).detail == "No API key configured"
    with pytest.raises(ProviderError) as e:
        await collect(p)
    assert e.value.code == "not_configured"
