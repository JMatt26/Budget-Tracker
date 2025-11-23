# tests/test_config.py
import os
from app.core import config as config_module


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
    settings = _fresh_settings(
        monkeypatch,
        {"BUDGET_APP_ENV": "prod"},
    )

    assert settings.env == "prod"
    assert settings.is_prod is True
    assert settings.is_dev is False
    assert settings.is_test is False
