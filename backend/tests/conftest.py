import os
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app

# In-memory DB just for tests
SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Create all tables at the start of testing
Base.metadata.create_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

def _has_postgres() -> bool:
    return os.environ.get("TEST_DATABASE_URL", "").startswith(("postgres://", "postgresql"))


def pytest_collection_modifyitems(config, items):
    """Tests marked `postgres` need a real server (TEST_DATABASE_URL).

    Locally they skip without one. A CI job that is supposed to run them sets
    REQUIRE_POSTGRES_TESTS=1, and then a missing server is an error, never a
    quiet skip: otherwise a broken service container would leave CI green
    while testing nothing.
    """
    if _has_postgres():
        return
    if os.environ.get("REQUIRE_POSTGRES_TESTS") == "1":
        raise pytest.UsageError(
            "REQUIRE_POSTGRES_TESTS=1 but TEST_DATABASE_URL does not point at PostgreSQL"
        )
    skip = pytest.mark.skip(reason="needs PostgreSQL: set TEST_DATABASE_URL")
    for item in items:
        if "postgres" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def todays_date_is_the_machines(monkeypatch):
    """The app decides "today" in its configured timezone, but these tests
    build their dates from date.today(); keep the two equal so the suite
    doesn't flake for a few hours each day when the machine (e.g. CI, in UTC)
    and the app timezone are on different dates. The timezone logic itself is
    tested with an injected clock in test_budget_cycles_safety.py."""
    monkeypatch.setattr("app.budget_cycles.today_local", date.today)


@pytest.fixture(autouse=True)
def rate_limiting_is_off_by_default():
    """Most tests register/login many users from one client IP; the dedicated
    tests in test_rate_limit.py switch the limiter on."""
    from app.rate_limit import limiter

    limiter.enabled = False
    limiter.reset()
    yield
    limiter.enabled = False
    limiter.reset()


@pytest.fixture()
def client():
    return TestClient(app)

@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    """
    Returns a TestClient with a logged-in user and Authorization header set.
    """
    register_payload = {
        "email": "user@example.com",
        "password": "testpassword123",
    }
    # Ignore if already exists within same test; DB is reset per test anyway
    client.post("/auth/register", json=register_payload)

    login_data = {
        "username": "user@example.com",
        "password": "testpassword123",
    }
    resp = client.post(
        "/auth/login",
        data=login_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]

    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture
def make_user_client():
    """Factory returning a fresh logged-in TestClient for the given email, so a
    test can act as several users at once."""

    def _make(email: str, password: str = "testpassword123") -> TestClient:
        c = TestClient(app)
        resp = c.post("/auth/register", json={"email": email, "password": password})
        assert resp.status_code == 201, resp.text
        resp = c.post(
            "/auth/login",
            data={"username": email, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 200, resp.text
        c.headers.update({"Authorization": f"Bearer {resp.json()['access_token']}"})
        return c

    return _make
