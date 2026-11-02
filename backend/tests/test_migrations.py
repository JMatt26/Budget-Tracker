"""The Alembic migrations must build exactly the schema the models describe.

`alembic check` fails when the models have changed without a matching
migration, so a PR that edits app/models.py but forgets `alembic revision
--autogenerate` fails CI here rather than breaking production.

The migrations run in a subprocess, the way Render runs them, against a
throwaway database (a temp SQLite file, and when TEST_DATABASE_URL points at
Postgres, a temporary database created on that server).
"""
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.core.config import normalize_database_url

BACKEND_DIR = Path(__file__).resolve().parent.parent

EXPECTED_TABLES = {
    "users", "categories", "transactions", "budgets",
    "budget_categories", "budget_targets", "incomes", "transaction_categories",
}


def _alembic(database_url: str, *args: str) -> subprocess.CompletedProcess:
    env = {
        **os.environ,
        "BUDGET_APP_ENV": "test",
        "BUDGET_APP_DATABASE_URL": database_url,
    }
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True,
    )
    assert result.returncode == 0, (
        f"alembic {' '.join(args)} failed:\n{result.stdout}\n{result.stderr}"
    )
    return result


def _assert_migrations_match_models(url: str) -> None:
    _alembic(url, "upgrade", "head")

    engine = create_engine(url)
    try:
        assert EXPECTED_TABLES <= set(inspect(engine).get_table_names())
    finally:
        engine.dispose()

    # no drift between the migrated schema and app.models
    checked = _alembic(url, "check")
    assert "No new upgrade operations detected" in (checked.stdout + checked.stderr)

    # every migration can be undone and re-applied
    _alembic(url, "downgrade", "base")
    _alembic(url, "upgrade", "head")


def test_there_is_a_single_migration_head():
    heads = _alembic("sqlite://", "heads").stdout.strip().splitlines()
    assert len([h for h in heads if "(head)" in h]) == 1, heads


def test_migrations_match_models_on_sqlite(tmp_path):
    _assert_migrations_match_models(f"sqlite:///{tmp_path / 'migrations.db'}")


@pytest.mark.postgres
def test_migrations_match_models_on_postgres():
    server_url = make_url(normalize_database_url(os.environ["TEST_DATABASE_URL"]))
    name = f"migtest_{uuid.uuid4().hex[:10]}"

    admin = create_engine(server_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        _assert_migrations_match_models(
            server_url.set(database=name).render_as_string(hide_password=False)
        )
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_existing_transaction_categories_survive_the_upgrade(tmp_path):
    url = f"sqlite:///{tmp_path / 'data.db'}"
    _alembic(url, "upgrade", "0001")

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO users (id, email, hashed_password) VALUES (1, 'a@b.c', 'x')"))
            conn.execute(text("INSERT INTO categories (id, name, type, user_id) VALUES (7, 'Food', 'expense', 1)"))
            conn.execute(text(
                "INSERT INTO transactions (id, amount, date, category_id, user_id, type) VALUES "
                "(1, 5, '2026-10-01', 7, 1, 'income'), (2, 6, '2026-10-02', NULL, 1, 'income')"
            ))

        _alembic(url, "upgrade", "head")
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT transaction_id, category_id FROM transaction_categories")).all()
        assert rows == [(1, 7)]

        _alembic(url, "downgrade", "0001")
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, category_id FROM transactions ORDER BY id")).all()
        assert rows == [(1, 7), (2, None)]
    finally:
        engine.dispose()
