import pytest

from app.core.config import normalize_database_url
from app.db import engine_options


@pytest.mark.parametrize(
    "url, expected",
    [
        ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("postgresql://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        (
            "postgresql://u:p@host:5432/db?sslmode=require",
            "postgresql+psycopg://u:p@host:5432/db?sslmode=require",
        ),
        # already explicit: left alone
        ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("postgresql+asyncpg://u:p@host/db", "postgresql+asyncpg://u:p@host/db"),
        # sqlite untouched
        ("sqlite:///./sql_app.db", "sqlite:///./sql_app.db"),
        ("sqlite://", "sqlite://"),
    ],
)
def test_normalize_database_url(url, expected):
    assert normalize_database_url(url) == expected


def test_settings_normalize_the_env_url(monkeypatch):
    from app.core import config as config_module

    monkeypatch.setenv("BUDGET_APP_DATABASE_URL", "postgres://u:p@host/db?sslmode=require")
    config_module.get_settings.cache_clear()
    try:
        assert (
            config_module.get_settings().database_url
            == "postgresql+psycopg://u:p@host/db?sslmode=require"
        )
    finally:
        config_module.get_settings.cache_clear()


def test_sqlite_engine_options_only_relax_thread_check():
    assert engine_options("sqlite:///./x.db") == {
        "connect_args": {"check_same_thread": False}
    }


def test_postgres_engine_options_are_pooled_and_pre_pinged():
    opts = engine_options("postgresql+psycopg://u:p@host/db")
    assert "connect_args" not in opts  # check_same_thread is SQLite-only
    assert opts["pool_pre_ping"] is True
    assert opts["pool_recycle"] <= 300
    assert opts["pool_size"] + opts["max_overflow"] <= 5
