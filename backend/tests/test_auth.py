# backend/tests/test_auth.py
from fastapi.testclient import TestClient


def test_register_user(client: TestClient):
    payload = {
        "email": "test@example.com",
        "password": "supersecurepassword",
    }

    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 201, resp.text

    data = resp.json()
    assert data["id"] is not None
    assert data["email"] == "test@example.com"


def test_register_duplicate_email_fails(client: TestClient):
    payload = {
        "email": "dup@example.com",
        "password": "somepassword",
    }

    resp1 = client.post("/auth/register", json=payload)
    assert resp1.status_code == 201

    resp2 = client.post("/auth/register", json=payload)
    assert resp2.status_code == 400
    body = resp2.json()
    assert "already exists" in body["detail"]


def test_login_returns_token(client: TestClient):
    register_payload = {
        "email": "login@example.com",
        "password": "validpassword",
    }
    reg_resp = client.post("/auth/register", json=register_payload)
    assert reg_resp.status_code == 201, reg_resp.text

    login_data = {
        "username": "login@example.com",   # OAuth2PasswordRequestForm uses 'username'
        "password": "validpassword",
    }
    resp = client.post(
        "/auth/login",
        data=login_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials(client: TestClient):
    register_payload = {
        "email": "badlogin@example.com",
        "password": "correctpassword",
    }
    client.post("/auth/register", json=register_payload)

    login_data = {
        "username": "badlogin@example.com",
        "password": "wrongpassword",
    }

    resp = client.post(
        "/auth/login",
        data=login_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert resp.status_code == 401
