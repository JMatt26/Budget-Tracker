import pytest

from app.rate_limit import client_ip, limiter


@pytest.fixture
def limited():
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.enabled = False
    limiter.reset()


def _login(client, password="wrong-password", ip=None):
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if ip:
        headers["X-Forwarded-For"] = ip
    return client.post(
        "/auth/login",
        data={"username": "nobody@example.com", "password": password},
        headers=headers,
    )


def test_login_is_limited_per_ip(client, limited):
    codes = [_login(client).status_code for _ in range(12)]

    assert codes[:10] == [401] * 10  # wrong password, but allowed to try
    assert codes[10:] == [429, 429]


def test_limit_response_is_a_clean_json_error(client, limited):
    for _ in range(10):
        _login(client)
    resp = _login(client)

    assert resp.status_code == 429
    assert resp.json() == {
        "detail": "Too many requests. Please wait a moment and try again.",
        "code": "RATE_LIMITED",
    }
    assert resp.headers["retry-after"] == "60"


def test_register_is_limited_per_ip(client, limited):
    def register(i):
        return client.post(
            "/auth/register",
            json={"email": f"user{i}@example.com", "password": "testpassword123"},
        ).status_code

    codes = [register(i) for i in range(7)]

    assert codes[:5] == [201] * 5
    assert codes[5:] == [429, 429]


def test_different_ips_have_separate_budgets(client, limited):
    for _ in range(10):
        assert _login(client, ip="203.0.113.1").status_code == 401
    assert _login(client, ip="203.0.113.1").status_code == 429

    # a different caller (via the proxy header) is unaffected
    assert _login(client, ip="203.0.113.2").status_code == 401


def test_a_successful_login_still_works_within_the_limit(client, limited):
    client.post("/auth/register", json={"email": "ok@example.com", "password": "testpassword123"})
    resp = client.post(
        "/auth/login",
        data={"username": "ok@example.com", "password": "testpassword123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200


def test_other_endpoints_are_not_limited(auth_client, limited):
    for _ in range(30):
        assert auth_client.get("/categories/").status_code == 200


def test_limiter_is_off_by_default_in_tests(client):
    # guard for the autouse fixture: the rest of the suite relies on it
    codes = {_login(client).status_code for _ in range(15)}
    assert codes == {401}


def test_client_ip_prefers_the_first_forwarded_address():
    class Req:
        def __init__(self, headers, host="10.0.0.1"):
            self.headers = headers
            self.client = type("C", (), {"host": host})()

    assert client_ip(Req({"x-forwarded-for": "198.51.100.7, 10.0.0.9"})) == "198.51.100.7"
    assert client_ip(Req({})) == "10.0.0.1"
