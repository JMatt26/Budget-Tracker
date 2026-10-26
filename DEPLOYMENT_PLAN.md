# Budget Tracker: Free-Tier Deployment Plan (rev. 2, based on `origin/main` @ e621eef3)

**Stack:** Vercel (frontend, existing Pro team) + Render free web service (FastAPI) + Neon free Postgres.
**Audience:** a human following along, or Claude executing it. Every step has an owner, exact files/commands, and a "Done when" check.
**Cost:** $0 added. (Optional: Render Starter ~$7/mo removes cold starts. The AWS alternative is parked in [DEPLOYMENT_PLAN_AWS.md](DEPLOYMENT_PLAN_AWS.md), written against the older code.)
**Free-tier limits change.** Confirm current terms on each provider's pricing page before step 3.1.

## What changed since rev. 1 (why this plan was remade)

`main` gained PRs #41-#44 (multiple incomes, payment methods, budget targets/charts, recurring budgets with history). Effects on deployment:

| New on `main` | Impact | Handled in |
|---|---|---|
| [schema_upgrades.py](backend/app/schema_upgrades.py): ad-hoc `ALTER TABLE` run on **every startup** after `create_all` | Conflicts with introducing Alembic; it is the project's only "migration" mechanism today. In prod it must go away; Alembic owns the schema. | 1.5, 1.7 |
| [budget_cycles.py](backend/app/budget_cycles.py): `roll_over_budgets()` **writes on read** (`GET /budgets`, `GET /budgets/{id}`, transaction create) | (a) Uses the **server's** `date.today()`: Render runs in UTC, so a Toronto user's budget rolls over in the early evening. (b) Two concurrent requests can both create the same next cycle (duplicate rows, no unique constraint). | 1.6 |
| `Income` is now many-per-user, `BudgetTarget`, `Transaction.payment_method`, `Budget.recurrence/series_id` | Initial Alembic migration must match these models; isolation tests must cover the new resources. | 1.2, 1.7 |
| The author changes models in nearly every PR | Once prod is Alembic-managed, **every future model change needs a migration** or prod breaks. CI must catch drift. | 1.7, 1.10, 1.12, Part 5 |
| Untracked `backend/sql_app.db.bak-before-income-migration` in the working tree | A copy of a real dev DB; must never be committed. `.gitignore` only covers `sql_app.db`. | 1.12 |

Still true from rev. 1: `Category.name` is **globally unique** ([models.py:20](backend/app/models.py:20)); `db.py` hard-codes SQLite's `check_same_thread`; `alembic.ini`/`env.py` are empty; `requirements.txt` is unpinned and lacks `alembic`, `psycopg`, `gunicorn`; `main.py` allows `*` CORS and the dev secret by default; no CI exists; `api.ts` silently falls back to `http://localhost:8000`; React Query devtools ship in the bundle.

## How to use this plan

- Steps are numbered in dependency order. **Do not skip ahead.** Parts 1-2 are local and reversible; Part 3 touches external services; Part 4 verifies.
- **[AGENT]** = Claude can do it with repo/CLI access. **[HUMAN]** = needs a login, dashboard or a decision (Claude must stop and ask, never guess credentials).
- **Rule for Part 1: every change to `models.py` lands before step 1.7**, so the single initial migration describes the final schema.
- Never paste real secrets into chat, commits, or this file. Secrets live only in Render/Vercel/Neon dashboards and git-ignored `.env` files.
- Commit after each numbered step in Part 1 (message = step title). Don't push until Part 2.
- **Baseline: `cd backend && .venv/bin/python -m pytest -q` -> 69 passed** on `origin/main` (Python 3.12.12 venv). It must be green after every Part 1 step.

## Architecture and ordering constraint

```
Browser -> https://<project>.vercel.app    (static SPA, built with VITE_API_URL)
        -> https://budget-api.onrender.com (FastAPI/gunicorn; runs `alembic upgrade head` on start)
        -> Neon Postgres (TLS, direct connection string)
```

Circular dependency (frontend build needs API URL; API CORS needs frontend URL), resolved in Part 3: Neon -> Render with a **placeholder CORS origin** -> Vercel with the Render URL -> **update Render's CORS** -> redeploy.

## Decisions to make first [HUMAN] (defaults in bold)

| # | Decision | Default |
|---|---|---|
| D1 | Base branch | **`deploy-prep` off `origin/main`** (the redesign is already merged; the old `ui_refactor` dependency is gone). Currently checked out is local `History`, which is already merged: don't build on it. |
| D2 | Regions (API and DB together; neither host has a Canadian region, as far as I know: verify) | **Neon AWS us-east-1 + Render Virginia** |
| D3 | Public registration or invite-only | **Public, with rate limiting (1.9)** |
| D4 | Custom domain | **Later;** use `*.vercel.app` / `*.onrender.com` |
| D5 | Timezone used to decide when a budget cycle has ended (single app-wide setting; per-user timezones are a later feature) | **`America/Toronto`** via `BUDGET_APP_TIMEZONE` |

---

# Part 1: Code changes (local, branch `deploy-prep`)

### 1.0 [AGENT] Branch and baseline
```bash
git fetch origin && git switch -c deploy-prep origin/main
cd backend && .venv/bin/python -m pytest -q        # expect 69 passed
cd ../frontend && npm ci && npm run build && npm run lint   # record any pre-existing failures
```
**Done when:** the commands pass (or pre-existing lint/build issues are written down so later steps aren't blamed). Make sure `backend/sql_app.db.bak-before-income-migration` stays untracked (`git status`).

### 1.1 [AGENT] Category names unique per user, not globally
- In `Category`: drop `unique=True` from `name` (keep `index=True`); add `__table_args__ = (UniqueConstraint("user_id", "name", name="uq_categories_user_name"),)`.
- Router already checks per user ([categories.py](backend/app/routers/categories.py)); wrap create/update commits so an `IntegrityError` returns the same 400 "already exists" instead of a 500.
- Tests in `test_categories.py`: two users can both create "Food"; the same user twice gets 400.
- Local dev DBs keep the old constraint: delete `backend/sql_app.db` (git-ignored) to regenerate.

**Done when:** new tests pass; suite green.

### 1.2 [AGENT] Cross-user isolation tests for every resource
Add `tests/test_isolation.py`. Register users A and B; as A create a category, transactions (with a payment method), a budget with categories and a **target**, several **incomes**, and a recurring budget with history. As B assert empty lists and 404 (never data) for list/get/put/delete on: categories, transactions, budgets, budget categories, budget target, budget stats/weekly/monthly, **budget history** (`/budgets/{A's id}/history`), income (each of A's income ids), reports. Also: B creating a transaction/budget-category that references A's category or budget id must be rejected.
Fix any leak in the router (`user_id == current_user.id`) and keep the test.

**Done when:** isolation tests pass for every resource; suite green.

### 1.3 [AGENT] Database layer: Postgres-safe, SQLite kept for dev/tests
Files: [config.py](backend/app/core/config.py), [db.py](backend/app/db.py).
- `config.py`: normalize `postgres://` and `postgresql://` to `postgresql+psycopg://` (Neon/Render hand out the short form); leave `sslmode=require` in the URL.
- `db.py`: only pass `connect_args={"check_same_thread": False}` for SQLite; for Postgres use `pool_size=3, max_overflow=2, pool_pre_ping=True, pool_recycle=300` (Neon drops idle connections after ~5 minutes).
- `tests/test_db_url.py` for the normalizer (postgres://, postgresql://, already normalized, sqlite untouched).

**Done when:** unit tests pass; suite green on SQLite.

### 1.4 [AGENT] Dependencies: pin, add what prod needs, split dev
Files: `backend/requirements.txt`, new `backend/requirements-dev.txt`.
- Runtime, exact pins (versions taken from `.venv/bin/pip freeze` after verifying tests pass): `fastapi, uvicorn[standard], sqlalchemy, alembic, psycopg[binary], gunicorn, python-jose[cryptography], passlib, bcrypt (version compatible with passlib, e.g. 4.0.1), pydantic[email], python-multipart, python-dotenv, tzdata, slowapi`.
- Drop from runtime what is not imported (grep `app/` first): likely `sqlmodel`, `aiosqlite`, `greenlet`. Dev file: `-r requirements.txt` + `pytest, pytest-asyncio, httpx` (+ any of the dropped ones tests actually need).
- Prove it with a **fresh venv in the scratchpad dir**: `python3.12 -m venv <scratch>/v && <scratch>/v/bin/pip install -r requirements-dev.txt && <scratch>/v/bin/python -m pytest -q`.

**Done when:** a fresh venv built only from the requirements files passes all 69+ tests and imports `psycopg, gunicorn, alembic, slowapi, zoneinfo`.

### 1.5 [AGENT] Production safety, and retire the startup schema hack in prod
Files: [config.py](backend/app/core/config.py), [main.py](backend/app/main.py), [schema_upgrades.py](backend/app/schema_upgrades.py), rename `core/__inti__.py` -> `__init__.py`.
- `config.py`: add `BUDGET_APP_DEBUG` (default false) and `BUDGET_APP_TIMEZONE` (default `America/Toronto`; validate with `ZoneInfo`). When `env == "prod"` **raise at startup** if: secret key is the default or `< 32` chars; CORS origins contain `*` or are empty; DB URL is SQLite. Messages name the variable, never print values.
- `main.py`:
  - Replace `@app.on_event("startup")` with a `lifespan` handler that runs `create_all` **and** `upgrade_schema` **only when env is `dev` or `test`**. In prod the schema comes from Alembic alone. (`schema_upgrades.py` stays for old local SQLite DBs; add a docstring note that it is dev-only and must not gain new upgrades: use Alembic instead.)
  - Hide `/docs`, `/redoc`, `/openapi.json` unless `debug` or env is dev/test.
  - CORS: keep `allow_credentials=True` only with explicit origins; `allow_methods` = `GET,POST,PUT,PATCH,DELETE,OPTIONS`; `allow_headers` = `Authorization,Content-Type`.
  - Keep `/health` **DB-free** (a DB-touching check would keep Neon awake all day and burn its free compute hours).
- Tests in `tests/test_config.py`: prod + default secret raises; prod + `*` raises; prod + SQLite raises; valid prod loads; docs 404 in prod and 200 in dev; bad timezone raises. Update `test_cors.py`/`test_health.py` to the intended behavior (don't delete).

**Done when:** new tests pass; suite green; `BUDGET_APP_ENV=prod` with the dev `.env` secret refuses to boot.

### 1.6 [AGENT] Harden budget rollover (new in this revision)
Files: [budget_cycles.py](backend/app/budget_cycles.py), [models.py](backend/app/models.py), [routers/budgets.py](backend/app/routers/budgets.py), [routers/transactions.py](backend/app/routers/transactions.py).
- **Timezone:** `roll_over_budgets(db, user_id, today=None)` currently defaults to `date.today()` (server/UTC). Default instead to `datetime.now(ZoneInfo(settings.timezone)).date()` (single helper `today_local()` in `budget_cycles.py`). Existing tests that pass `today` explicitly keep working.
- **Duplicate cycles under concurrency:** add `UniqueConstraint("series_id", "start_date", name="uq_budgets_series_start")` to `Budget` (NULL `series_id` rows are allowed multiple times by both SQLite and Postgres, so one-off budgets are unaffected). In `roll_over_budgets`, create each new cycle inside `with db.begin_nested():` + `db.flush()`; on `IntegrityError` the savepoint rolls back, then re-query the series' latest cycle and continue (another request already created it). Never let the error reach the client.
- **Tests (`test_budget_history.py` additions):** (a) rollover with an injected `today` in a different local date than UTC produces the cycle the configured timezone expects (patch `today_local`); (b) pre-insert the next cycle row, then call `roll_over_budgets`: no exception, no duplicate, series intact; (c) skipped-multiple-cycles case still catches up with exactly one row per period; (d) unique constraint rejects a direct duplicate insert.
- Leave the GET-triggers-write design alone (it works and is tested); just make it safe. Note it in Part 5 as a known design trade-off.

**Done when:** new tests pass; entire suite green (the 69 existing budget/transaction tests untouched).

### 1.7 [AGENT] Alembic: real migrations (all model changes are now done)
Files: `backend/alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`, `alembic/versions/` (today `alembic.ini` and `env.py` are 0-byte files).
- Run `alembic init` in a scratch dir to copy standard skeletons, then adapt: `env.py` imports `Base` (`app.db`), `models`, and `get_settings()`; `target_metadata = Base.metadata`; URL from settings (never from `alembic.ini`); `compare_type=True`; `render_as_batch` only for SQLite. `alembic.ini`: `script_location = alembic`, no URL.
- Generate against an **empty** SQLite file: `BUDGET_APP_DATABASE_URL=sqlite:///./tmp_mig.db alembic revision --autogenerate -m "initial schema"`, then delete `tmp_mig.db`. Review by hand: tables `users, categories, transactions, budgets, budget_categories, budget_targets, incomes`; constraints `uq_categories_user_name` and `uq_budgets_series_start`; `budgets.recurrence`, `budgets.series_id` (+ index), `transactions.payment_method`, `incomes.name`, and **no** unique on `incomes.user_id`. **No legacy data migration is needed** (no prod data exists; `schema_upgrades` stays out of the chain).
- **Verify on real Postgres** (Docker is installed):
  ```bash
  docker run --rm -d --name pgtest -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=budget -p 5433:5432 postgres:16
  export BUDGET_APP_DATABASE_URL=postgresql://postgres:pw@localhost:5433/budget
  alembic upgrade head && alembic check && alembic downgrade base && alembic upgrade head
  ```
- `tests/test_migrations.py` (runs only when `TEST_DATABASE_URL` points at Postgres; **in CI it must never silently skip**, see 1.10): upgrade on an empty DB, then assert `alembic check` reports no drift. **This is the guard that fails CI whenever a future PR changes a model without a migration.**

**Done when:** upgrade, check, downgrade and re-upgrade all succeed on Postgres 16; suite green on SQLite.

### 1.8 [AGENT] Integration smoke test: whole API on Postgres under gunicorn
With the container from 1.7 running and migrated:
```bash
BUDGET_APP_ENV=prod BUDGET_APP_SECRET_KEY=$(openssl rand -hex 32) \
BUDGET_APP_CORS_ORIGINS=http://localhost:5173 BUDGET_APP_TIMEZONE=America/Toronto \
gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 1 -b 127.0.0.1:8000
```
Via `curl`/a script: register, login, categories, transactions (expense needs a payment method), several incomes with different frequencies (incl. `semimonthly`), a recurring monthly budget whose period ended in the past (rollover creates the right cycles), budget history, targets, reports. **Concurrency check:** fire ~10 parallel `GET /budgets` for a user with an overdue recurring budget; afterwards confirm exactly one new cycle row per period and no 5xx. Confirm `/docs` is 404 and a request with `Origin: https://evil.example` gets no CORS allow header. Then `docker stop pgtest`.

**Done when:** every flow works on Postgres under gunicorn; no 500s; no duplicate cycles.

### 1.9 [AGENT] Rate-limit auth endpoints
- `slowapi` limits on `POST /auth/login` (e.g. 10/min per IP) and `POST /auth/register` (e.g. 5/min per IP). Render is behind a proxy: use the first entry of `X-Forwarded-For` as the key (and gunicorn `--forwarded-allow-ips="*"`), otherwise all users share one bucket.
- Tests: the 11th login in a minute returns 429; limiter disabled by default in `test` env so existing auth tests are unaffected.

**Done when:** tests pass; suite green.

### 1.10 [AGENT] Make the entire test suite run on both databases (CI foundation)
Today [conftest.py](backend/tests/conftest.py) hard-codes an in-memory SQLite engine, so tests can't prove anything about Postgres. Make the suite database-agnostic:
- `conftest.py`: read `TEST_DATABASE_URL`. Unset -> current in-memory SQLite (`StaticPool`, `check_same_thread=False`). Set -> `create_engine(normalized_url, pool_pre_ping=True)` (use the 1.3 normalizer); schema via `Base.metadata.create_all`/`drop_all` per test as today. Keep the `get_db` override and `clean_db` fixture. For Postgres, truncate-or-drop between tests must not leave state behind (verify with `-p no:randomly` and again in random order if `pytest-randomly` is added).
- Add pytest settings (the empty `pyproject.toml` is the place): `[tool.pytest.ini_options] testpaths = ["tests"]`, `addopts = "-ra --strict-markers"`, and a `postgres` marker for tests that only make sense there (`test_migrations.py`, the concurrency test from 1.8 if scripted).
- **No silent skips in CI:** `postgres`-marked tests skip locally when `TEST_DATABASE_URL` isn't Postgres, but when env `CI=true` a `conftest.py` hook (or `pytest_collection_modifyitems`) turns that skip into a failure. Otherwise a misconfigured service container would make CI green while testing nothing.
- Run locally against the Docker Postgres from 1.7: `TEST_DATABASE_URL=postgresql://postgres:pw@localhost:5433/budget .venv/bin/python -m pytest -q`. Fix real dialect differences these tests expose (e.g. `Numeric` rounding, case-sensitive `LIKE` in category search, date handling, ordering without `ORDER BY`) **in the app code**, not by weakening tests.

**Done when:** the same 69+ tests (all 12 test files plus the new ones) pass on SQLite **and** on Postgres 16, locally.

### 1.11 [AGENT] Frontend unit tests (the frontend currently has none)
There are no frontend tests today (`package.json` has only `lint`). Add a small, low-maintenance Vitest setup so CI has something real to gate on:
- Dev deps: `vitest` (pinned; works with the existing Vite 5 config). Scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
- Unit tests for the pure, logic-heavy modules that the new budget/income features depend on: `src/features/dashboard/metrics.ts`, `src/features/budgets/projection.ts`, `src/lib/incomeProjections.ts`, `src/lib/format.ts`, and the `VITE_API_URL` guard in `src/lib/api.ts` (production without the var throws; dev falls back to localhost). Cover edge cases: zero income, semimonthly (24/yr), leap-year/month-end dates, empty data.
- No component/E2E tests in this pass (keep it cheap); say so in the README.

**Done when:** `npm run lint && npm run typecheck && npm test && npm run build` all pass locally.

### 1.12 [AGENT] Deployment files, CI, hygiene
- **`render.yaml`** (repo root; Render Blueprint):
  ```yaml
  services:
    - type: web
      name: budget-api
      runtime: python
      plan: free
      region: virginia          # match Neon region (D2)
      rootDir: backend
      buildCommand: pip install -r requirements.txt
      startCommand: alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 1 -b 0.0.0.0:$PORT --timeout 60 --graceful-timeout 30 --keep-alive 5 --forwarded-allow-ips="*" --access-logfile - --error-logfile -
      healthCheckPath: /health
      autoDeploy: true
      envVars:
        - { key: PYTHON_VERSION, value: 3.12.12 }
        - { key: BUDGET_APP_ENV, value: prod }
        - { key: BUDGET_APP_TIMEZONE, value: America/Toronto }
        - { key: BUDGET_APP_SECRET_KEY, generateValue: true }
        - { key: BUDGET_APP_DATABASE_URL, sync: false }
        - { key: BUDGET_APP_CORS_ORIGINS, sync: false }
        - { key: BUDGET_APP_ACCESS_TOKEN_EXPIRE_MINUTES, value: "60" }
  ```
  Free instances have no pre-deploy command, so migrations run in the start command: safe with exactly one instance; never scale past 1 without moving migrations to a separate step. One worker fits the 512 MB free instance.
- **`frontend/vercel.json`**: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
- **`frontend/src/lib/api.ts`**: in production builds (`import.meta.env.PROD`) throw if `VITE_API_URL` is unset; keep the localhost fallback for dev only; remove the per-request `console.warn`.
- **`frontend/src/main.tsx`**: load `ReactQueryDevtools` only when `import.meta.env.DEV` (lazy import).
- **`frontend/.env.example`** (`VITE_API_URL=http://localhost:8000`) and **`backend/.env.example`** (all `BUDGET_APP_*` with dummy values). Confirm `git check-ignore backend/.env frontend/.env`.
- **`.gitignore`** (root and `backend/`): ignore `sql_app.db*`, `*.db`, `*.bak*`, `.env*` except `*.example`. Verify the `.bak-before-income-migration` file can't be added.
- **`.github/workflows/ci.yml`**: triggers `pull_request` (all branches into `main`) and `push` to `main`; `concurrency` group per ref with cancel-in-progress; top-level `permissions: contents: read`. **Every test in the repo runs here**, as four jobs:
  1. `backend-sqlite`: Python 3.12 with pip cache, `pip install -r requirements-dev.txt`, `pytest` (all of `backend/tests`, `TEST_DATABASE_URL` unset).
  2. `backend-postgres`: same install, with a `postgres:16` service container (health-checked via `pg_isready`), `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/budget_test`, `CI=true`, then `pytest` (the **entire** suite again, now including the `postgres`-marked migration-drift test; skips are failures per 1.10), then `alembic upgrade head && alembic check` as an explicit extra gate.
  3. `frontend`: Node 20 with npm cache, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` with a dummy `VITE_API_URL=https://example.invalid`.
  4. `ci-ok`: `needs: [backend-sqlite, backend-postgres, frontend]`, `if: always()`, fails unless all three succeeded. This single aggregate job is the **only required status check** in branch protection (3.6), so job renames or additions never silently drop out of the gate.
  Use pinned major versions of actions (`actions/checkout@v4`, `actions/setup-python@v5`, `actions/setup-node@v4`), upload `pytest` JUnit XML and the frontend `dist` size as artifacts only on failure, and don't pass any deployment or provider secrets to these jobs (tests need none; all test credentials are throwaway values defined in the workflow). No deploy job: Render and Vercel deploy from Git.
- **README.md**: replace "development version / SQLite temporary" wording; add Deployment section (link to this plan, env var table) and the rule **"changing a model requires `alembic revision --autogenerate` + commit the migration"**.
- Check the production bundle: `npm run build` output size with recharts + the new charts is acceptable on Vercel; note it if the main chunk exceeds ~1 MB (optional: lazy-load `BudgetCharts`).

**Done when:** `render.yaml` parses; `npm run build` passes with `VITE_API_URL` set and **fails** without it; the workflow validates (`actionlint` if available, or `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`) and its commands pass when run locally in the same order (SQLite suite, Postgres suite against the Docker container, frontend chain); `git status` shows no `.db`/`.bak`/`.env` files staged. The real proof is the first PR run in 2.2.

---

# Part 2: Merge gate

### 2.1 [AGENT] Final local verification
Suite green on SQLite; migration test green on Docker Postgres; frontend lint + build green; `git diff origin/main --stat` reviewed; **no secrets in the diff** (`git diff origin/main | grep -iE "secret|password|postgres://"` shows only placeholders/tests).

### 2.2 [HUMAN] PR, first CI run, and merge
1. Push `deploy-prep`, open a PR into `main`. The CI workflow (1.12) runs for the first time: confirm all four jobs appear and pass (`backend-sqlite`, `backend-postgres`, `frontend`, `ci-ok`). Open the `backend-postgres` log and confirm the migration-drift test **ran** (not skipped) and that the test count matches the local run. A first-run failure here is expected-possible (CI-only differences); fix and push again.
2. **Make CI a hard gate** (GitHub -> repo Settings -> Branches -> add rule for `main`): require a pull request, require status check **`ci-ok`** (only that one), require branches to be up to date before merging, no force pushes. (Branch protection on private repos may need a paid GitHub plan; if unavailable, treat "CI green" as a manual rule and rely on Render's "After CI checks pass" in 3.6.)
3. Review and merge. If `main` moved meanwhile, rebase and re-run 1.7: **regenerate or add a migration if any model changed** (CI's drift check will tell you).

**Done when:** `main` has everything, CI is green on `main`, and a deliberately failing test pushed on a throwaway branch is shown to block merging (then delete that branch).

---

# Part 3: Provision and deploy (order matters)

### 3.1 [HUMAN] Neon database
1. neon.com (free plan) -> project `budget-tracker`, Postgres 16, region per D2.
2. Copy the **direct** connection string (host without `-pooler`) with `sslmode=require`; the pooler can break migrations and a 1-worker app doesn't need it.
3. Optional: create a Neon `dev` branch for scratch testing; never test on `main` branch data.

**Done when:** you have the string, kept only in a password manager. Don't paste it into chat.

### 3.2 [HUMAN] Render backend
1. Render account; connect GitHub with access to this repo only.
2. New -> **Blueprint** -> select the repo -> Render reads `render.yaml` (service `budget-api`, free plan).
3. When prompted: `BUDGET_APP_DATABASE_URL` = Neon string; `BUDGET_APP_CORS_ORIGINS` = `https://placeholder.invalid` (temporary). `BUDGET_APP_SECRET_KEY` is auto-generated.
4. Apply; watch logs: Alembic applies the initial migration, then gunicorn boots.
5. Copy the URL (`https://budget-api-xxxx.onrender.com`).

**Done when:** `curl https://budget-api-xxxx.onrender.com/health` returns `{"status":"ok"}` (allow ~1 min first boot) and the Neon dashboard lists the tables and `alembic_version`.
**If it fails:** read deploy logs. Usual causes: wrong DB URL form (needs `sslmode=require`), `PYTHON_VERSION` vs pinned deps, or a 1.5 safety check naming the offending variable.

### 3.3 [HUMAN] Vercel frontend
1. Vercel (existing Pro team) -> Add New Project -> import the repo.
2. **Root Directory = `frontend`**; Framework Preset = Vite (build `npm run build`, output `dist`).
3. Env var `VITE_API_URL` = Render URL from 3.2 (no trailing slash), **set before the first build** (Production, and Preview if wanted).
4. Deploy; copy the canonical production URL (`https://budget-tracker-xxxx.vercel.app`).

**Done when:** the site loads the login page. Login fails until 3.4.

### 3.4 [HUMAN] Close the CORS loop
Render -> `budget-api` -> Environment -> `BUDGET_APP_CORS_ORIGINS` = the exact Vercel production origin (scheme + host, no path/trailing slash; several origins comma-separated). Save (Render redeploys). Add any custom domain later (D4).
**Done when:** registration and login work from the Vercel site; network tab shows correct CORS headers.

### 3.5 [HUMAN] Keep-warm monitor (optional, recommended)
UptimeRobot (free): HTTP(s) monitor on `https://budget-api-xxxx.onrender.com/health` every 5 min with email alerts. Never point it at a DB-touching endpoint. Check Render's monthly free-hours usage after a week.

### 3.6 [HUMAN] Auto-deploy gating
Render -> Settings -> Auto-Deploy: **"After CI checks pass"** (so a red `ci-ok` on `main` never reaches production). Vercel production branch = `main`; Vercel -> Settings -> Git: enable "Require successful GitHub checks" / deployment protection if your plan offers it, otherwise rely on the branch protection from 2.2 (merges to `main` only happen after `ci-ok` is green).

---

# Part 4: Verification on the live site [AGENT via browser tools if logged in, else HUMAN]

Use two throwaway accounts, A and B:
- [ ] Register A and B; login, reload (session persists), logout.
- [ ] Both create a category "Food" (1.1).
- [ ] A adds multiple incomes (including twice-a-month), expenses with each payment method, and a budget with category limits and targets; dashboard, budget detail, charts and reports show consistent numbers.
- [ ] **Recurring budgets:** A creates a weekly or monthly recurring budget whose period already ended; after opening the budgets page there is exactly one current cycle plus history (no duplicates); reload several times and open the same page in two tabs at once: still no duplicates.
- [ ] **Timezone:** around local evening (after ~7-8 pm Toronto, past UTC midnight) a budget ending *today* is still current, not rolled over.
- [ ] B sees none of A's data anywhere, including `/budgets/<A id>` and its history/targets (1.2).
- [ ] Refresh on deep links (`/budgets`, `/income`, `/reports`) loads (`vercel.json`).
- [ ] `https://<api>/docs` and `/openapi.json` return 404.
- [ ] Console: no CORS errors, no mixed content; Render logs are structured and contain no passwords/tokens.
- [ ] After 15+ min idle the first request is slow but succeeds; a redeploy keeps A's data.
- [ ] 11 rapid wrong logins -> 429.
- [ ] Delete the test users (SQL in the Neon console).

# Part 5: Operations

- **Deploys:** merge to `main` -> CI -> Render and Vercel deploy; migrations run on Render start. **Rollback:** Render -> Deploys -> redeploy previous; Vercel -> promote previous. Keep migrations backward compatible (add first, remove in a later release): the DB is not rolled back with the app.
- **Schema workflow (changed!):** edit models -> `alembic revision --autogenerate -m "..."` -> review -> commit. Do not add to `schema_upgrades.py`. CI's drift check blocks PRs that forget.
- **Known design trade-off:** read requests can write (budget rollover). It's now race-safe and timezone-correct for one app-wide timezone; if users span timezones, add a per-user timezone later.
- **Backups:** Neon free has only a short restore window (verify). Monthly: `pg_dump "<direct connection string>" -Fc -f budget-$(date +%F).dump`, stored privately; test a restore into a Neon branch once.
- **Rotation:** `BUDGET_APP_SECRET_KEY` (logs everyone out) and the Neon role password (update Render env, redeploy).
- **Capacity:** watch Neon storage/compute-hours and Render hours; first upgrade if needed is Render Starter (~$7/mo).
- **Dependencies:** Dependabot (pip, npm, github-actions); periodic `pip-audit`/`npm audit`.
- **Privacy:** publish a privacy notice and terms before inviting people; add `DELETE /auth/me` (model cascades already exist) before onboarding strangers. Decide whether non-Canadian hosting is acceptable for your users' data.
- **Move to AWS later:** this work is provider-neutral; the AWS plan needs refreshing against current code (it predates PR #41-#44).

---

## Environment variable reference

| Variable | Where | Value |
|---|---|---|
| `BUDGET_APP_ENV` | Render (`render.yaml`) | `prod` |
| `BUDGET_APP_DATABASE_URL` | Render (secret, dashboard) | Neon **direct** string with `?sslmode=require` |
| `BUDGET_APP_SECRET_KEY` | Render (auto-generated) | random, >= 32 chars; unique to this app |
| `BUDGET_APP_CORS_ORIGINS` | Render (dashboard) | exact Vercel origin(s), comma-separated, no `*` |
| `BUDGET_APP_TIMEZONE` | Render | `America/Toronto` (D5) |
| `BUDGET_APP_ACCESS_TOKEN_EXPIRE_MINUTES` | Render | `60` |
| `PYTHON_VERSION` | Render | `3.12.12` |
| `VITE_API_URL` | Vercel (build-time) | Render URL, no trailing slash |
| `TEST_DATABASE_URL` | CI (`backend-postgres` job) and local Postgres runs | the `postgres:16` service URL; unset = in-memory SQLite |
| `CI` | GitHub Actions (set automatically) | `true`: turns skipped Postgres tests into failures |

## Go-live checklist

| # | Item | Step |
|---|---|---|
| 1 | Category names unique per user; isolation tests cover every resource incl. history, targets, incomes | 1.1, 1.2 |
| 2 | App boots on Postgres; SQLite still works for dev/tests | 1.3, 1.8 |
| 3 | Deps pinned; clean-venv install passes | 1.4 |
| 4 | Prod refuses default secret / `*` CORS / SQLite; docs hidden; startup schema hack dev-only | 1.5 |
| 5 | Budget rollover race-safe (unique constraint) and uses configured timezone | 1.6 |
| 6 | Alembic migrations verified on Postgres (up, check, down, up); CI drift check | 1.7 |
| 7 | Whole API and concurrent rollover tested on Postgres under gunicorn | 1.8 |
| 8 | Auth endpoints rate-limited | 1.9 |
| 9 | Whole backend suite passes on SQLite **and** Postgres; frontend unit tests exist and pass | 1.10, 1.11 |
| 10 | `render.yaml`, `vercel.json`, API-URL guard, CI workflow (4 jobs), `.gitignore`, README done | 1.12 |
| 11 | PR merged to `main` with `ci-ok` required by branch protection; failing test proven to block merge; Postgres tests confirmed not skipped | 2.1, 2.2 |
| 11 | Neon -> Render -> Vercel -> CORS in the stated order | 3.1-3.4 |
| 12 | Uptime monitor and auto-deploy gating set | 3.5, 3.6 |
| 13 | Part 4 checks pass on the live site | Part 4 |
| 14 | Privacy notice published; account deletion added or consciously deferred | Part 5 |

## Execution protocol for Claude

1. Work only in Part 1 until the user says to continue; one numbered step at a time, run its "Done when" check, commit, then report briefly.
2. If a check fails, fix it before moving on; never loosen a test or safety check to get green. If the plan is wrong about the code (a file moved, `main` changed again), say so and update this file.
3. Stop and hand over at every **[HUMAN]** step with exact instructions; never ask for, read, or store real credentials.
4. Don't push, open the PR, or touch external services without the user's explicit go-ahead. Remove the scratch git worktree (`git worktree remove`) when finished.
