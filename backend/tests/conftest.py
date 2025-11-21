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
