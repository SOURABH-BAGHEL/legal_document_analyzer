def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["ai_mode"] == "demo"


def test_settings_never_expose_secrets(client):
    res = client.get("/api/settings")
    assert res.status_code == 200
    body = res.json()
    assert body["max_upload_size_mb"] == 20
    assert body["allowed_file_types"] == ["docx", "pdf", "txt"]
    assert body["ai"]["mode"] == "demo"
    flat = str(body).lower()
    assert "api_key" not in flat and "sk-" not in flat


def test_unknown_route_returns_consistent_error(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "HTTP_ERROR"


def test_openapi_docs_available(client):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    paths = res.json()["paths"]
    for path in ["/api/documents/upload", "/api/analysis/{document_id}/analyze", "/api/dashboard/stats", "/api/health"]:
        assert path in paths
