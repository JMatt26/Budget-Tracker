# app/middleware/request_logging.py
import logging
from time import perf_counter

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs every request in a structured way and emits coarse audit logs for
    write operations (POST/PUT/PATCH/DELETE) on key resources.
    """

    def __init__(self, app):
        super().__init__(app)
        self.logger = logging.getLogger("app.request")
        self.audit_logger = logging.getLogger("audit")

    async def dispatch(self, request: Request, call_next):
        start = perf_counter()

        response: Response = await call_next(request)

        process_time_ms = (perf_counter() - start) * 1000.0
        user_id = getattr(request.state, "user_id", None)

        # General request log
        self.logger.info(
            "request_completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "process_time_ms": round(process_time_ms, 2),
                "user_id": user_id,
            },
        )

        # Coarse audit log for write operations on key resources
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith(
            ("/transactions", "/budgets", "/categories", "/auth/login", "/auth/register")
        ):
            self.audit_logger.info(
                "audit_event",
                extra={
                    "action": f"{request.method} {request.url.path}",
                    "status_code": response.status_code,
                    "user_id": user_id,
                },
            )

        return response
