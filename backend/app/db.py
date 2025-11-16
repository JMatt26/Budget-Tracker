import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./budget.sqlite3")

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
)

async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

@asynccontextmanager
async def lifespan(app):
    # Ensure tables exist at startup (dev convenience; prod uses Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield 

async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session() as session:
        yield session