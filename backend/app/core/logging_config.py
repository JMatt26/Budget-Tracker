# app/core/logging_config.py
import json
import logging
import sys
from logging.config import dictConfig


class JsonFormatter(logging.Formatter):
    """Minimal JSON formatter for production-friendly logs."""

    def format(self, record: logging.LogRecord) -> str:
        log_record = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include extra attributes (those not part of the standard LogRecord)
        standard_attrs = {
            "name",
            "msg",
            "args",
            "levelname",
            "levelno",
            "pathname",
            "filename",
            "module",
            "exc_info",
            "exc_text",
            "stack_info",
            "lineno",
            "funcName",
            "created",
            "msecs",
            "relativeCreated",
            "thread",
            "threadName",
            "processName",
            "process",
        }

        for key, value in record.__dict__.items():
            if key in standard_attrs:
                continue
            if key.startswith("_"):
                continue
            log_record[key] = value

        return json.dumps(log_record, default=str)


def configure_logging() -> None:
    """Configure application-wide logging in JSON to stdout."""
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "()": "app.core.logging_config.JsonFormatter",
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "stream": sys.stdout,
                    "formatter": "json",
                }
            },
            "loggers": {
                # Uvicorn loggers (if running under uvicorn)
                "uvicorn": {
                    "handlers": ["console"],
                    "level": "INFO",
                    "propagate": False,
                },
                "uvicorn.error": {
                    "handlers": ["console"],
                    "level": "INFO",
                    "propagate": False,
                },
                "uvicorn.access": {
                    "handlers": ["console"],
                    "level": "INFO",
                    "propagate": False,
                },
                # Application logger
                "app": {
                    "handlers": ["console"],
                    "level": "INFO",
                    "propagate": False,
                },
                # Audit logger (for important actions)
                "audit": {
                    "handlers": ["console"],
                    "level": "INFO",
                    "propagate": False,
                },
            },
            "root": {
                "handlers": ["console"],
                "level": "INFO",
            },
        }
    )
