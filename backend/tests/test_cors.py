from starlette.testclient import TestClient


def test_cors_simple_get_includes_header(client: TestClient):
    # Simulate a browser hitting the API from a different origin.
    resp = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code == 200

    # With default BUDGET_APP_CORS_ORIGINS="*", this should be "*" or the origin.
    allow_origin = resp.headers.get("access-control-allow-origin")
    assert allow_origin in ("*", "http://localhost:5173")


def _prod_client(monkeypatch, origins: str) -> TestClient:
    import os

    from app.core import config as config_module
    from app.main import create_app

    for key in [k for k in os.environ if k.startswith("BUDGET_APP_")]:
        monkeypatch.delenv(key)
    monkeypatch.setenv("BUDGET_APP_ENV", "prod")
    monkeypatch.setenv("BUDGET_APP_DATABASE_URL", "postgresql://u:p@host/db")
    monkeypatch.setenv("BUDGET_APP_SECRET_KEY", "x" * 48)
    monkeypatch.setenv("BUDGET_APP_CORS_ORIGINS", origins)
    try:
        return TestClient(create_app(config_module.Settings()))
    finally:
        config_module.get_settings.cache_clear()


def test_prod_cors_allows_only_the_configured_origin(monkeypatch):
    client = _prod_client(monkeypatch, "https://app.example.com")

    ok = client.get("/health", headers={"Origin": "https://app.example.com"})
    assert ok.headers.get("access-control-allow-origin") == "https://app.example.com"

    evil = client.get("/health", headers={"Origin": "https://evil.example"})
    assert evil.status_code == 200  # the endpoint itself still answers
    assert "access-control-allow-origin" not in evil.headers  # but the browser blocks it


def test_prod_preflight_is_limited_to_needed_methods_and_headers(monkeypatch):
    client = _prod_client(monkeypatch, "https://app.example.com")

    resp = client.options(
        "/budgets/",
        headers={
            "Origin": "https://app.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert resp.status_code == 200
    assert "authorization" in resp.headers["access-control-allow-headers"].lower()
    assert "access-control-allow-credentials" not in resp.headers

    bad = client.options(
        "/budgets/",
        headers={
            "Origin": "https://app.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-evil-header",
        },
    )
    assert bad.status_code == 400
