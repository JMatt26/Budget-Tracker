# Budget App (Development Version)

This is the development version of the **Budget App**, a full‑stack personal finance tracker. The application is currently under active development and not yet ready for production use.

## Overview

The app provides users with the ability to:

- Register and authenticate using JWT-based authentication.
- Track income and expenses.
- Manage budgets by category.
- View transactions and generate financial reports.

## Tech Stack

**Backend:** FastAPI, SQLAlchemy, Alembic, Python 3.12\
**Frontend:** React + TypeScript + Vite (in development)\
**Database:** SQLite (temporary for dev)\
**Auth:** JWT via `python-jose` and password hashing via `passlib[bcrypt]`

## Development Status

- Database models, schemas, and routers: **Implemented**
- Authentication: **Implemented**
- Budget, Transactions, and Reports endpoints: **Implemented**
- Frontend integration: **In progress**

## Running the Backend (Dev)

1. ```cd backend```
2. Create virtual environment, `python -m venv .venv`
3. Activate your virtual environment, ```source .venv/bin/activate```
4. Install dependencies: `pip install -r requirements.txt`
5. Ensure your `.env` file is set up with proper variables.
6. Start the app:
   ```bash
   uvicorn app.main:app --reload
   ```

## Running the Frontend (Dev)
1. ```cd frontend```
2. ```npm run dev```
3. Open the link at the localhost specified in the terminal.

## Notes

- On startup, the app auto‑creates database tables for development.
- SQLite is used during dev for convenience. A production database will be configured later.
- The API is evolving as the frontend integration progresses.

## Todo

- Finish User Testing to catch any necessary changes and track them in issues
- Finish all tasks marked in issues
- Replace SQLite with PostgreSQL for production.

---

**This README will expand as the project stabilizes.**

