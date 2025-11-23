# app/core/config.py
import os
from functools import lru_cache
from typing import List
from pathlib import Path
from dotenv import load_dotenv

# Auto-load .env file if present
env_path = Path(".") / ".env"
if env_path.exists():
    load_dotenv(env_path)


class Settings:
    def __init__(self) -> None:
        # Basic app metadata
        self.app_name: str = os.getenv("BUDGET_APP_NAME", "Budget App API")
        self.app_version: str = os.getenv("BUDGET_APP_VERSION", "0.1.0")
        self.env: str = os.getenv("BUDGET_APP_ENV", "dev")  # dev | test | prod

        # Environment helpers
        self.is_dev: bool = self.env == "dev"
        self.is_test: bool = self.env == "test"
        self.is_prod: bool = self.env == "prod"

        # Database
        self.database_url: str = os.getenv(
            "BUDGET_APP_DATABASE_URL",
            "sqlite:///./sql_app.db",
        )

        # JWT / Auth
        self.jwt_secret_key: str = os.getenv(
            "BUDGET_APP_SECRET_KEY",
            "dev-secret-key",
        )
        self.jwt_algorithm: str = os.getenv("BUDGET_APP_ALGORITHM", "HS256")
        self.access_token_expire_minutes: int = int(
            os.getenv("BUDGET_APP_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
        )

        # CORS — allow JSON list OR comma-separated list
        cors_raw = os.getenv("BUDGET_APP_CORS_ORIGINS", "*").strip()

        parsed: List[str] = []
        if cors_raw == "":
            parsed = []
        elif cors_raw == "*":
            parsed = ["*"]
        else:
            # Try JSON first
            import json
            try:
                data = json.loads(cors_raw)
                if isinstance(data, list):
                    parsed = data
                else:
                    parsed = []
            except json.JSONDecodeError:
                # fallback to comma-separated
                parsed = [origin.strip() for origin in cors_raw.split(",")]

        self.backend_cors_origins: List[str] = parsed


@lru_cache
def get_settings() -> Settings:
    return Settings()
