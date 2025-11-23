from app.core.config import get_settings


def test_settings_defaults_are_present():
    settings = get_settings()

    # Basic sanity checks
    assert settings.app_name
    assert settings.app_version
    assert settings.jwt_algorithm == "HS256"

    # CORS config should be a non-empty list by default (["*"])
    assert isinstance(settings.backend_cors_origins, list)
    assert settings.backend_cors_origins
