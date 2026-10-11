import pytest

from app.core.errors import AppError
from app.schemas.api import AppSettings
from app.services.routing_service import decide_route


def route(mode, text="hello", *, local="llama3", cloud=True, cloud_enabled=True, private=False, confirm=False, model=None):
    prefs = AppSettings(ollama_model=local, cloud_enabled=cloud_enabled)
    return decide_route(mode=mode, prefs=prefs, text=text, cloud_configured=cloud, model_override=model,
                        private_context=private, confirm_cloud=confirm)


def test_local_mode_is_always_local():
    for text in ("hello", "def f(): pass", "x" * 20000):
        r = route("local", text)
        assert r.provider_id == "ollama" and not r.leaves_device


def test_local_mode_without_model_errors_instead_of_using_cloud():
    with pytest.raises(AppError) as e:
        route("local", local="")
    assert e.value.code == "no_local_model"


def test_cloud_mode_requires_key_and_switch():
    assert route("cloud").leaves_device
    with pytest.raises(AppError) as e:
        route("cloud", cloud=False)
    assert e.value.code == "not_configured"
    with pytest.raises(AppError) as e:
        route("cloud", cloud_enabled=False)
    assert e.value.code == "cloud_disabled"


def test_smart_routes_by_category():
    assert route("smart", "hello there").provider_id == "ollama"
    assert route("smart", "why does this traceback happen in python").provider_id == "anthropic"
    assert route("smart", "x" * 13000).provider_id == "anthropic"


def test_smart_keeps_private_local_and_never_goes_cloud_when_disabled():
    assert route("smart", "```code```", private=True).provider_id == "ollama"
    assert route("smart", "```code```", cloud_enabled=False).provider_id == "ollama"


def test_smart_private_to_cloud_needs_confirmation():
    with pytest.raises(AppError) as e:
        route("smart", "secret", private=True, local="")
    assert e.value.code == "confirmation_required"
    assert route("smart", "secret", private=True, local="", confirm=True).leaves_device


def test_smart_with_nothing_available_errors():
    with pytest.raises(AppError) as e:
        route("smart", local="", cloud=False)
    assert e.value.code == "no_provider"
