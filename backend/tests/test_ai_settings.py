import httpx

from app.database import SessionLocal
from app.models import AISetting
from app.services.llm import base as llm_base
from app.services.llm.providers import describe_ai_status, get_llm_provider

SECRET = "nvapi-super-secret-1234"


def _ok_handler(calls: list):
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"status": "ok"}'}}]})

    return handler


def _mock_http(monkeypatch, handler):
    """Route every provider created during the test through a fake transport (no network)."""
    original = llm_base.LLMProvider.__init__

    def init(self, *args, **kwargs):
        original(self, *args, **kwargs)
        self.transport = httpx.MockTransport(handler)

    monkeypatch.setattr(llm_base.LLMProvider, "__init__", init)


def _provider(body, provider_id):
    return next(p for p in body["providers"] if p["id"] == provider_id)


def test_defaults_come_from_env_and_list_every_provider(client):
    body = client.get("/api/settings/ai").json()
    assert body["active_provider"] == "demo" and body["customized"] is False
    assert [p["id"] for p in body["providers"]] == ["anthropic", "nvidia", "openai", "demo"]
    assert _provider(body, "nvidia")["has_key"] is False


def test_save_applies_immediately_and_never_returns_the_key(client):
    res = client.put("/api/settings/ai", json={"provider": "nvidia", "model": " mistralai/x ", "api_key": f"Bearer {SECRET}"})
    assert res.status_code == 200
    assert SECRET not in res.text
    nvidia = _provider(res.json(), "nvidia")
    assert res.json()["active_provider"] == "nvidia" and res.json()["customized"] is True
    assert nvidia["model"] == "mistralai/x"
    assert nvidia["has_key"] and nvidia["key_source"] == "saved" and nvidia["key_hint"] == "••••1234"

    provider = get_llm_provider()
    assert provider.name == "nvidia" and provider.model == "mistralai/x" and provider.api_key == SECRET
    settings = client.get("/api/settings")
    assert settings.json()["ai"]["mode"] == "live" and SECRET not in settings.text


def test_blank_key_keeps_saved_key_and_each_provider_keeps_its_own(client):
    client.put("/api/settings/ai", json={"provider": "nvidia", "api_key": SECRET})
    client.put("/api/settings/ai", json={"provider": "nvidia", "model": "other/model", "api_key": ""})
    assert get_llm_provider().api_key == SECRET

    client.put("/api/settings/ai", json={"provider": "anthropic", "api_key": "sk-ant-another-key"})
    assert get_llm_provider().name == "anthropic"
    client.put("/api/settings/ai", json={"provider": "nvidia", "model": "other/model"})
    provider = get_llm_provider()
    assert provider.name == "nvidia" and provider.api_key == SECRET and provider.model == "other/model"


def test_selecting_demo_turns_ai_off_and_reset_removes_saved_keys(client):
    client.put("/api/settings/ai", json={"provider": "nvidia", "api_key": SECRET})
    client.put("/api/settings/ai", json={"provider": "demo"})
    assert get_llm_provider() is None

    body = client.delete("/api/settings/ai").json()
    assert body["customized"] is False and _provider(body, "nvidia")["has_key"] is False
    with SessionLocal() as db:
        assert db.query(AISetting).count() == 0


def test_missing_key_is_reported_not_crashed(client):
    client.put("/api/settings/ai", json={"provider": "nvidia"})
    assert describe_ai_status()["mode"] == "misconfigured"
    assert client.get("/api/settings/ai").json()["active_provider"] == "nvidia"
    res = client.post("/api/settings/ai/test", json={"provider": "nvidia"}).json()
    assert res["status"] == "failed" and res["code"] == "AI_NOT_CONFIGURED"


def test_invalid_url_and_provider_are_rejected(client):
    res = client.put("/api/settings/ai", json={"provider": "openai", "api_url": "ftp://example.test"})
    assert res.status_code == 422 and res.json()["error"]["code"] == "INVALID_API_URL"
    assert client.put("/api/settings/ai", json={"provider": "nonsense"}).status_code == 422


def test_connection_test_success_is_one_call_and_saves_nothing(client, monkeypatch):
    calls: list = []
    _mock_http(monkeypatch, _ok_handler(calls))
    res = client.post("/api/settings/ai/test", json={"provider": "nvidia", "model": "m/x", "api_key": SECRET}).json()
    assert res["status"] == "ok" and res["model"] == "m/x" and res["latency_ms"] is not None
    assert SECRET not in str(res)
    assert len(calls) == 1 and calls[0].headers["authorization"] == f"Bearer {SECRET}"
    with SessionLocal() as db:
        assert db.query(AISetting).count() == 0


def test_connection_test_uses_saved_key_when_field_is_blank(client, monkeypatch):
    client.put("/api/settings/ai", json={"provider": "nvidia", "api_key": SECRET})
    calls: list = []
    _mock_http(monkeypatch, _ok_handler(calls))
    assert client.post("/api/settings/ai/test", json={"provider": "nvidia"}).json()["status"] == "ok"
    assert calls[0].headers["authorization"] == f"Bearer {SECRET}"


def test_connection_test_reports_rejected_key(client, monkeypatch):
    _mock_http(monkeypatch, lambda r: httpx.Response(401))
    res = client.post("/api/settings/ai/test", json={"provider": "nvidia", "api_key": "bad-key"})
    assert res.status_code == 200 and res.json()["status"] == "failed"
    assert "rejected the API key" in res.json()["message"]


def test_connection_test_reports_unknown_model(client, monkeypatch):
    _mock_http(monkeypatch, lambda r: httpx.Response(404, json={"detail": "Function not found"}))
    res = client.post("/api/settings/ai/test", json={"provider": "nvidia", "model": "no/such", "api_key": "k"}).json()
    assert res["status"] == "failed" and "no/such" in res["message"] and "Function not found" in res["message"]


def test_connection_test_timeout(client, monkeypatch):
    def timeout(request):
        raise httpx.ReadTimeout("slow", request=request)

    _mock_http(monkeypatch, timeout)
    res = client.post("/api/settings/ai/test", json={"provider": "nvidia", "api_key": "k"}).json()
    assert res["status"] == "failed" and res["code"] == "AI_TIMEOUT"


def test_connection_test_warns_when_reply_is_not_json(client, monkeypatch):
    _mock_http(monkeypatch, lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "Hello!"}}]}))
    res = client.post("/api/settings/ai/test", json={"provider": "nvidia", "api_key": "k"}).json()
    assert res["status"] == "warning" and res["code"] == "NOT_JSON"


def test_demo_connection_test_needs_no_network(client):
    res = client.post("/api/settings/ai/test", json={"provider": "demo"}).json()
    assert res["status"] == "ok"
