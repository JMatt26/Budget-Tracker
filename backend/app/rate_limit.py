"""Rate limiting for the unauthenticated auth endpoints (brute force, signup spam).

State is in memory, which is exact for the single-worker deployment this app
runs as. If it is ever scaled to several workers, give the limiter a shared
storage_uri (e.g. Redis) or each worker will count separately.
"""
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from . import schemas
from .core.config import get_settings


def client_ip(request: Request) -> str:
    """The caller's IP, honouring X-Forwarded-For (the app runs behind a
    host's proxy, where request.client is the proxy for every caller).

    The leftmost entry is client-controlled, so a determined attacker can
    spoof it to dodge this limit; it stops casual abuse, not a targeted one.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


_settings = get_settings()

LOGIN_LIMIT = _settings.login_rate_limit
REGISTER_LIMIT = _settings.register_rate_limit

limiter = Limiter(key_func=client_ip, enabled=_settings.rate_limit_enabled)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    payload = schemas.ErrorResponse(
        detail="Too many requests. Please wait a moment and try again.",
        code="RATE_LIMITED",
    ).model_dump()
    return JSONResponse(status_code=429, content=payload, headers={"Retry-After": "60"})
