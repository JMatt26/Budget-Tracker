from datetime import date
from starlette.testclient import TestClient


def test_unauthorized_returns_standard_error_shape(client: TestClient):
    # /transactions is protected; no auth header -> 401
    resp = client.get("/transactions")
    assert resp.status_code == 401

    data = resp.json()
    # shape enforced by our HTTPException handler
    assert isinstance(data, dict)
    assert "detail" in data
    assert "code" in data
    # FastAPI's OAuth2PasswordBearer uses this message
    assert data["detail"] == "Not authenticated"


def test_not_found_uses_error_response_shape(auth_client: TestClient):
    # Some large ID that will not exist
    resp = auth_client.get("/transactions/999999")
    assert resp.status_code == 404

    data = resp.json()
    assert isinstance(data, dict)
    assert "detail" in data
    assert "code" in data
    # Your route should be raising HTTPException(404, "Transaction not found")
    assert data["detail"].startswith("Transaction not found")


def test_validation_error_uses_standard_shape(auth_client: TestClient):
    # Missing required fields -> 422 validation error
    resp = auth_client.post("/transactions", json={})
    assert resp.status_code == 422

    data = resp.json()
    assert isinstance(data, dict)
    assert data["detail"] == "Validation error"
    assert data["code"] == "VALIDATION_ERROR"
