# Budget App

A full-stack personal finance tracker: log income and expenses, plan recurring weekly/monthly budgets with category limits and targets, and see reports and projections.

## Overview

The app provides users with the ability to:

- Register and authenticate using JWT-based authentication.
- Track income (several sources, each with its own frequency), expenses (with a payment method) and investments.
- Manage recurring budgets by category, with per-cycle history and spending/investing/saving targets.
- View transactions and generate financial reports.

## Tech Stack

**Backend:** FastAPI, SQLAlchemy, Alembic, Python 3.12\
**Frontend:** React + TypeScript + Vite + Tailwind\
**Database:** SQLite for local development, PostgreSQL in production\
**Auth:** JWT via `python-jose` and password hashing via `passlib` (`pbkdf2_sha256`)\
**Hosting:** Vercel (frontend) + Render (API) + Neon (Postgres). See [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md).

## Running the Backend (Dev)

1. `cd backend`
2. Create a virtual environment: `python3.12 -m venv .venv`
3. Activate it: `source .venv/bin/activate`
4. Install dependencies: `pip install -r requirements-dev.txt`
5. Copy `.env.example` to `.env` and adjust (it is git-ignored).
6. Start the app:
   ```bash
   uvicorn app.main:app --reload
   ```

In `dev` the app creates its tables on startup. In `prod` it never alters the schema itself: migrations do (see below).

## Running the Frontend (Dev)

1. `cd frontend`
2. `npm ci`
3. Copy `.env.example` to `.env` (points at `http://localhost:8000`).
4. `npm run dev`, then open the link printed in the terminal.

## Tests

```bash
# backend (in-memory SQLite)
cd backend && pytest

# backend against PostgreSQL (the database name must contain "test": every table is dropped and recreated)
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/budget_test pytest

# frontend
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

GitHub Actions runs all of the above on every pull request (`.github/workflows/ci.yml`); the single required check is `ci-ok`.

## Database migrations (Alembic)

Production schema changes come only from migrations. **If you change `app/models.py` you must add a migration**, otherwise CI fails:

```bash
cd backend
alembic revision --autogenerate -m "describe the change"   # then review the generated file
alembic upgrade head                                        # apply locally
```

`alembic check` (run by the test suite) fails when the models and migrations disagree. Do not add new in-place upgrades to `app/schema_upgrades.py`; it only exists for old local SQLite databases.

## Configuration

Set in `backend/.env` locally and in the host's dashboard in production (see `backend/.env.example` and `render.yaml`).

| Variable | Notes |
|---|---|
| `BUDGET_APP_ENV` | `dev`, `test` or `prod`. `prod` refuses to start with an unsafe configuration. |
| `BUDGET_APP_DATABASE_URL` | SQLite locally; a Postgres URL (`?sslmode=require`) in production. |
| `BUDGET_APP_SECRET_KEY` | Random, at least 32 characters in `prod`. |
| `BUDGET_APP_CORS_ORIGINS` | Exact frontend origin(s); `*` is rejected in `prod`. |
| `BUDGET_APP_TIMEZONE` | Decides when a recurring budget's cycle ends (default `America/Toronto`). |
| `VITE_API_URL` (frontend) | API base URL; **required** for production builds. |

## Deployment

See [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) for the step-by-step free-tier setup (Neon, Render, Vercel).

## Todo

- Finish user testing to catch any necessary changes and track them in issues
- Finish all tasks marked in issues
- Add account deletion and a privacy notice before opening registration widely
