# app/core/config.py
import os
from functools import lru_cache
from typing import List
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from dotenv import load_dotenv

# Auto-load .env file if present
env_path = Path(".") / ".env"
if env_path.exists():
    load_dotenv(env_path)


def normalize_database_url(url: str) -> str:
    """Point Postgres URLs at the psycopg (v3) driver.

    Hosts such as Neon and Render hand out `postgres://` or `postgresql://`
    URLs, which SQLAlchemy would otherwise resolve to the psycopg2 driver.
    Everything else (SQLite, an explicit `+driver`) is left untouched.
    """
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


class ConfigError(RuntimeError):
    """The environment configuration is unsafe or invalid; refuse to start."""


KNOWN_ENVS = ("dev", "test", "prod")
DEFAULT_SECRET_KEY = "dev-secret-key"
MIN_SECRET_KEY_LENGTH = 32


class Settings:
    def __init__(self) -> None:
        # Basic app metadata
        self.app_name: str = os.getenv("BUDGET_APP_NAME", "Budget App API")
        self.app_version: str = os.getenv("BUDGET_APP_VERSION", "0.1.0")
        self.env: str = os.getenv("BUDGET_APP_ENV", "dev")  # dev | test | prod
        self.debug: bool = os.getenv("BUDGET_APP_DEBUG", "false").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )

        # The one timezone the app uses to decide what "today" is (e.g. when a
        # recurring budget's cycle has ended). Servers usually run in UTC.
        self.timezone: str = os.getenv("BUDGET_APP_TIMEZONE", "America/Toronto")

        # Environment helpers
        self.is_dev: bool = self.env == "dev"
        self.is_test: bool = self.env == "test"
        self.is_prod: bool = self.env == "prod"

        # Database
        self.database_url: str = normalize_database_url(
            os.getenv(
                "BUDGET_APP_DATABASE_URL",
                "sqlite:///./sql_app.db",
            )
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

        self.validate()

    @property
    def docs_enabled(self) -> bool:
        """Interactive API docs expose the whole schema: dev/test or DEBUG only."""
        return self.debug or not self.is_prod

    def validate(self) -> None:
        """Raise ConfigError for settings that are invalid, or unsafe in prod.

        Messages name the offending variable but never print its value.
        """
        problems: List[str] = []

        if self.env not in KNOWN_ENVS:
            problems.append(
                f"BUDGET_APP_ENV must be one of {', '.join(KNOWN_ENVS)}"
            )

        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            problems.append("BUDGET_APP_TIMEZONE is not a valid IANA timezone name")

        if self.is_prod:
            if (
                self.jwt_secret_key == DEFAULT_SECRET_KEY
                or len(self.jwt_secret_key) < MIN_SECRET_KEY_LENGTH
            ):
                problems.append(
                    "BUDGET_APP_SECRET_KEY must be set to a random value of at "
                    f"least {MIN_SECRET_KEY_LENGTH} characters in prod"
                )
            if not self.backend_cors_origins or "*" in self.backend_cors_origins:
                problems.append(
                    "BUDGET_APP_CORS_ORIGINS must list the exact frontend "
                    "origin(s) in prod (no '*', not empty)"
                )
            if self.database_url.startswith("sqlite"):
                problems.append(
                    "BUDGET_APP_DATABASE_URL must point at a server database "
                    "(not SQLite) in prod"
                )

        if problems:
            raise ConfigError("Invalid configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
