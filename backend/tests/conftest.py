import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import async_session, create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db import get_session

transport = ASGITransport(app=app)

# @pytest.fixture(autouse=True)
@pytest_asyncio.fixture(autouse=True)
async def memory_db_override():
    # in-memory DB for isolated tests
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    from app import models

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async def _get_session():
        async with async_session() as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    yield
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c