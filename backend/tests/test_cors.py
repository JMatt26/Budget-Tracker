from starlette.testclient import TestClient


def test_cors_simple_get_includes_header(client: TestClient):
    # Simulate a browser hitting the API from a different origin.
    resp = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code == 200

    # With default BUDGET_APP_CORS_ORIGINS="*", this should be "*" or the origin.
    allow_origin = resp.headers.get("access-control-allow-origin")
    assert allow_origin in ("*", "http://localhost:5173")
