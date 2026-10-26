"""Alembic environment.

The schema source of truth is app.models (Base.metadata); the database URL
comes from the same settings the app uses, never from alembic.ini.
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app import models  # noqa: F401  (registers every table on Base.metadata)
from app.core.config import get_settings
from app.db import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _url() -> str:
    return get_settings().database_url


def _configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        compare_type=True,
        # SQLite can't ALTER most things in place; batch mode rebuilds tables.
        render_as_batch=_url().startswith("sqlite"),
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a DB connection (`alembic upgrade head --sql`)."""
    _configure(url=_url(), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # A throwaway, non-pooled engine; deliberately not the app's pooled one.
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        _configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
