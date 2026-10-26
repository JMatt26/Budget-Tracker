from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import get_settings

settings = get_settings()

DATABASE_URL = settings.database_url


def engine_options(url: str) -> dict:
    """create_engine() options suited to the database behind `url`."""
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    # Hosted Postgres (e.g. Neon) drops idle connections, so test each one
    # before use and recycle them well inside the provider's idle timeout.
    # Keep the pool small: free tiers allow few connections.
    return {
        "pool_size": 3,
        "max_overflow": 2,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }


engine = create_engine(DATABASE_URL, **engine_options(DATABASE_URL))

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
