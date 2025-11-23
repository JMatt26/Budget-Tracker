# app/core/config.py
import os
from functools import lru_cache
from typing import List


class Settings:
    def __init__(self) -> None:
        # Basic app metadata
        self.app_name: str = os.getenv("BUDGET_APP_NAME", "Budget App API")
        self.app_version: str = os.getenv("BUDGET_APP_VERSION", "0.1.0")
        self.env: str = os.getenv("BUDGET_APP_ENV", "dev")  # dev | test | prod

        # Database
        self.database_url: str = os.getenv(
            "BUDGET_APP_DATABASE_URL",
            "sqlite:///./sql_app.db",  # keep this in sync with your existing default
        )

        # JWT / auth
        self.jwt_secret_key: str = os.getenv(
            "BUDGET_APP_SECRET_KEY",
            "dev-secret-key",  # safe-ish default for local dev only
        )
        self.jwt_algorithm: str = os.getenv("BUDGET_APP_ALGORITHM", "HS256")
        self.access_token_expire_minutes: int = int(
            os.getenv("BUDGET_APP_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
        )

        # CORS
        # Example env var:
        #   BUDGET_APP_CORS_ORIGINS="http://localhost:5173,http://localhost:4173"
        cors_origins_raw = os.getenv("BUDGET_APP_CORS_ORIGINS", "*").strip()
        if cors_origins_raw == "":
            self.backend_cors_origins: List[str] = []
        else:
            self.backend_cors_origins = [
                origin.strip() for origin in cors_origins_raw.split(",")
            ]


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance so we don't re-parse env vars repeatedly.
    """
    return Settings()
