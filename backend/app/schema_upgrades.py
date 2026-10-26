"""Small in-place schema upgrades for databases created before a column
existed. create_all() only creates missing tables, not missing columns."""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from . import models
from .budget_cycles import infer_recurrence


def upgrade_schema(engine: Engine) -> None:
    columns = {c["name"] for c in inspect(engine).get_columns("budgets")}
    if "recurrence" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE budgets ADD COLUMN recurrence VARCHAR(20)"))
        conn.execute(text("ALTER TABLE budgets ADD COLUMN series_id INTEGER"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_budgets_series_id ON budgets (series_id)"))

    # Existing budgets start their own series; ones whose dates match the
    # Monthly/Weekly presets become recurring.
    with Session(engine) as db:
        for budget in db.query(models.Budget):
            budget.series_id = budget.id
            budget.recurrence = infer_recurrence(budget.start_date, budget.end_date)
        db.commit()
