# tests/test_config.py
import os

import pytest
from starlette.testclient import TestClient

from app.core import config as config_module
from app.core.config import ConfigError
from app.main import create_app


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Each test here builds its own settings; don't leak them to other tests."""
    yield
    config_module.get_settings.cache_clear()


GOOD_PROD_ENV = {
    "BUDGET_APP_ENV": "prod",
    "BUDGET_APP_DATABASE_URL": "postgresql://u:p@host/db?sslmode=require",
    "BUDGET_APP_SECRET_KEY": "x" * 48,
    "BUDGET_APP_CORS_ORIGINS": "https://app.example.com",
}


def _fresh_settings(monkeypatch, env: dict):
    # Clear all BUDGET_APP_* first
    for key in list(os.environ.keys()):
        if key.startswith("BUDGET_APP_"):
            monkeypatch.delenv(key, raising=False)

    # Apply overrides
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    # Reset cache
    config_module.get_settings.cache_clear()
    return config_module.get_settings()


def test_defaults(monkeypatch):
    settings = _fresh_settings(monkeypatch, {})

    assert settings.app_name == "Budget App API"
    assert settings.app_version == "0.1.0"

    assert settings.env == "dev"
    assert settings.is_dev is True
    assert settings.is_test is False
    assert settings.is_prod is False

    assert settings.database_url == "sqlite:///./sql_app.db"
    assert settings.jwt_secret_key == "dev-secret-key"
    assert settings.jwt_algorithm == "HS256"
    assert settings.access_token_expire_minutes == 60

    assert settings.backend_cors_origins == ["*"]  # default wildcard


def test_env_overrides(monkeypatch):
    settings = _fresh_settings(
        monkeypatch,
        {
            "BUDGET_APP_NAME": "Overridden Name",
            "BUDGET_APP_VERSION": "9.9.9",
            "BUDGET_APP_ENV": "test",
            "BUDGET_APP_DATABASE_URL": "sqlite:///./override.db",
            "BUDGET_APP_SECRET_KEY": "supersecret",
            "BUDGET_APP_ALGORITHM": "HS512",
            "BUDGET_APP_ACCESS_TOKEN_EXPIRE_MINUTES": "120",
            "BUDGET_APP_CORS_ORIGINS": '["http://a.com","http://b.com"]',
        },
    )

    assert settings.app_name == "Overridden Name"
    assert settings.app_version == "9.9.9"

    assert settings.env == "test"
    assert settings.is_test is True
    assert settings.is_dev is False
    assert settings.is_prod is False

    assert settings.database_url == "sqlite:///./override.db"
    assert settings.jwt_secret_key == "supersecret"
    assert settings.jwt_algorithm == "HS512"
    assert settings.access_token_expire_minutes == 120

    assert settings.backend_cors_origins == ["http://a.com", "http://b.com"]


def test_prod_profile(monkeypatch):
    settings = _fresh_settings(monkeypatch, GOOD_PROD_ENV)

    assert settings.env == "prod"
    assert settings.is_prod is True
    assert settings.is_dev is False
    assert settings.is_test is False


def test_valid_prod_config_loads(monkeypatch):
    settings = _fresh_settings(monkeypatch, GOOD_PROD_ENV)

    assert settings.is_prod
    assert settings.database_url.startswith("postgresql+psycopg://")
    assert settings.backend_cors_origins == ["https://app.example.com"]
    assert settings.docs_enabled is False


@pytest.mark.parametrize(
    "override, variable",
    [
        ({"BUDGET_APP_SECRET_KEY": "dev-secret-key"}, "BUDGET_APP_SECRET_KEY"),
        ({"BUDGET_APP_SECRET_KEY": "too-short"}, "BUDGET_APP_SECRET_KEY"),
        ({"BUDGET_APP_CORS_ORIGINS": "*"}, "BUDGET_APP_CORS_ORIGINS"),
        ({"BUDGET_APP_CORS_ORIGINS": ""}, "BUDGET_APP_CORS_ORIGINS"),
        ({"BUDGET_APP_CORS_ORIGINS": '["https://a.com","*"]'}, "BUDGET_APP_CORS_ORIGINS"),
        ({"BUDGET_APP_DATABASE_URL": "sqlite:///./sql_app.db"}, "BUDGET_APP_DATABASE_URL"),
    ],
)
def test_prod_refuses_unsafe_settings(monkeypatch, override, variable):
    with pytest.raises(ConfigError) as exc:
        _fresh_settings(monkeypatch, {**GOOD_PROD_ENV, **override})

    assert variable in str(exc.value)


def test_prod_error_never_prints_secret_values(monkeypatch):
    secret = "dev-secret-key"
    with pytest.raises(ConfigError) as exc:
        _fresh_settings(
            monkeypatch,
            {**GOOD_PROD_ENV, "BUDGET_APP_SECRET_KEY": secret, "BUDGET_APP_DATABASE_URL": "sqlite:///./x.db"},
        )
    assert secret not in str(exc.value)
    assert "x.db" not in str(exc.value)


def test_unsafe_settings_are_fine_outside_prod(monkeypatch):
    settings = _fresh_settings(monkeypatch, {"BUDGET_APP_ENV": "dev"})
    assert settings.jwt_secret_key == "dev-secret-key"
    assert settings.backend_cors_origins == ["*"]


def test_unknown_env_is_rejected(monkeypatch):
    # a typo like "production" must not silently run with dev behaviour
    with pytest.raises(ConfigError) as exc:
        _fresh_settings(monkeypatch, {"BUDGET_APP_ENV": "production"})
    assert "BUDGET_APP_ENV" in str(exc.value)


def test_timezone_default_and_validation(monkeypatch):
    assert _fresh_settings(monkeypatch, {}).timezone == "America/Toronto"
    assert _fresh_settings(monkeypatch, {"BUDGET_APP_TIMEZONE": "UTC"}).timezone == "UTC"
    with pytest.raises(ConfigError) as exc:
        _fresh_settings(monkeypatch, {"BUDGET_APP_TIMEZONE": "Mars/Olympus"})
    assert "BUDGET_APP_TIMEZONE" in str(exc.value)


def test_debug_flag(monkeypatch):
    assert _fresh_settings(monkeypatch, {}).debug is False
    assert _fresh_settings(monkeypatch, {"BUDGET_APP_DEBUG": "true"}).debug is True


def test_docs_are_hidden_in_prod_and_shown_in_dev(monkeypatch):
    prod = TestClient(create_app(_fresh_settings(monkeypatch, GOOD_PROD_ENV)))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert prod.get(path).status_code == 404, path
    assert prod.get("/health").status_code == 200

    dev = TestClient(create_app(_fresh_settings(monkeypatch, {"BUDGET_APP_ENV": "dev"})))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert dev.get(path).status_code == 200, path


def test_docs_can_be_enabled_in_prod_with_debug(monkeypatch):
    settings = _fresh_settings(monkeypatch, {**GOOD_PROD_ENV, "BUDGET_APP_DEBUG": "true"})
    assert TestClient(create_app(settings)).get("/docs").status_code == 200
