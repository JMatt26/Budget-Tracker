from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging
from app.core.logging_config import configure_logging
from app.core.config import Settings, get_settings
from app.middleware.request_logging import RequestLoggingMiddleware
from app.rate_limit import limiter, rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


from . import schemas

from .routers import transactions, categories, reports, budgets, auth, income

configure_logging()

logger = logging.getLogger("app.request")


def create_app(settings: Settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Local development and tests build the schema straight from the
        # models. Anywhere else the schema comes from Alembic migrations only
        # (`alembic upgrade head`), so the app never alters tables itself.
        if settings.is_dev or settings.is_test:
            from app.db import engine, Base
            from app import models
            from app.schema_upgrades import upgrade_schema

            Base.metadata.create_all(bind=engine)
            upgrade_schema(engine)
        yield

    docs = settings.docs_enabled
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
        # the docs and schema expose every route, so keep them off in prod
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    app.add_middleware(RequestLoggingMiddleware)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    if settings.backend_cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.backend_cors_origins,
            # auth is a bearer token in the Authorization header, never a
            # cookie, so browsers don't need to send credentials
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    # Deliberately does not touch the database: hosts ping this to keep the
    # service awake, and a DB query would also keep a serverless DB awake.
    @app.get("/health")
    async def health():
        return {"status": "ok"}

    app.include_router(transactions.router)
    app.include_router(categories.router)
    app.include_router(reports.router)
    app.include_router(budgets.router)
    app.include_router(auth.router)
    app.include_router(income.router)

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

    return app


app = create_app(get_settings())
