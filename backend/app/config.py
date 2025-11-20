import os
from pydantic import BaseModel, ValidationError

class SecuritySettings(BaseModel):
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

def load_security_settings() -> SecuritySettings:
    try:
        return SecuritySettings(
            secret_key=os.environ["BUDGET_APP_SECRET_KEY"],
            algorithm=os.getenv("BUDGET_APP_ALGORITHM", "HS256"),
            access_token_expire_minutes=int(
                os.getenv("BUDGET_APP_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
            ),
        )
    except KeyError as exc:
        raise RuntimeError(
            "BUDGET_APP_SECRET_KEY must be set in the environment for token signing."
        ) from exc
    except ValueError as exc:
        raise RuntimeError(
            "BUDGET_APP_ACCESS_TOKEN_EXPIRE_MINUTES must be an integer."
        ) from exc

security_settings = load_security_settings()