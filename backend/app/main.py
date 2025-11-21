from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging

from . import schemas

from .routers import transactions, categories, reports, budgets, auth

app = FastAPI(title="Budet App API", version="0.1.0")

logger = logging.getLogger("budget_app")

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(reports.router)
app.include_router(budgets.router)
app.include_router(auth.router)

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Normalize all HTTPException-style errors to:
    {
        "detail": "<message>",
        "code": null
    }
    """
    # Keep auth-related headers (WWW-Authenticate, etc.)
    headers = getattr(exc, "headers", None)

    payload = schemas.ErrorResponse(detail=str(exc.detail), code=None).model_dump()

    return JSONResponse(
        status_code=exc.status_code,
        content=payload,
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Collapse the verbose Pydantic validation error list into a single message.
    """
    logger.warning("Validation error on %s %s: %s", request.method, request.url.path, exc)

    payload = schemas.ErrorResponse(
        detail="Validation error",
        code="VALIDATION_ERROR",
    ).model_dump()

    return JSONResponse(
        status_code=422,
        content=payload,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for unexpected server errors. Never leak stack traces to the client.
    """
    logger.exception("Unhandled server error on %s %s", request.method, request.url.path)

    payload = schemas.ErrorResponse(
        detail="Internal server error",
        code="INTERNAL_SERVER_ERROR",
    ).model_dump()

    return JSONResponse(
        status_code=500,
        content=payload,
    )
