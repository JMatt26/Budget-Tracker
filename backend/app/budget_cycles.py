"""Rolling recurring budgets over into their next cycle.

A recurring budget is a series of Budget rows sharing a series_id, one per
cycle. When the current cycle has ended, a fresh cycle is created with the
same name, category limits and targets, and the old one stays as history.
"""
import calendar
from datetime import date, datetime, timedelta
from typing import Dict, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models
from .core.config import get_settings


def today_local(now: Optional[datetime] = None) -> date:
    """Today's date in the app's configured timezone (BUDGET_APP_TIMEZONE).

    The server usually runs in UTC, so date.today() would roll a user's
    budget over hours before their own midnight. `now` is for tests.
    """
    tz = ZoneInfo(get_settings().timezone)
    return (now.astimezone(tz) if now else datetime.now(tz)).date()


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def next_cycle_dates(end: date, recurrence: str):
    start = end + timedelta(days=1)
    if recurrence == "weekly":
        return start, start + timedelta(days=6)
    return start, _add_months(start, 1) - timedelta(days=1)


def infer_recurrence(start: date, end: date) -> Optional[str]:
    """Guess the recurrence of a budget created before it was stored, using
    the same rules the budgets page uses to label a period."""
    if start.day == 1 and end == date(start.year, start.month, calendar.monthrange(start.year, start.month)[1]):
        return "monthly"
    if (end - start).days == 6:
        return "weekly"
    return None


def series_key(budget: models.Budget) -> int:
    return budget.series_id or budget.id


def current_cycles(db: Session, user_id: int) -> Dict[int, models.Budget]:
    """The latest cycle of each of the user's budget series, by series key."""
    latest: Dict[int, models.Budget] = {}
    for budget in db.query(models.Budget).filter(models.Budget.user_id == user_id):
        key = series_key(budget)
        if key not in latest or budget.start_date > latest[key].start_date:
            latest[key] = budget
    return latest


def _start_next_cycle(db: Session, prev: models.Budget) -> models.Budget:
    start, end = next_cycle_dates(prev.end_date, prev.recurrence)
    budget = models.Budget(
        name=prev.name,
        limit=prev.limit,
        start_date=start,
        end_date=end,
        recurrence=prev.recurrence,
        series_id=series_key(prev),
        user_id=prev.user_id,
    )
    budget.budget_categories = [
        models.BudgetCategory(category_id=bc.category_id, limit=bc.limit)
        for bc in prev.budget_categories
    ]
    if prev.target is not None:
        budget.target = models.BudgetTarget(
            spending=prev.target.spending,
            invested=prev.target.invested,
            saved=prev.target.saved,
        )
    db.add(budget)
    return budget


def _next_cycle_or_existing(db: Session, prev: models.Budget) -> models.Budget:
    """Start prev's next cycle, or return it if a concurrent request already
    did. The unique (series_id, start_date) constraint arbitrates the race."""
    start, _ = next_cycle_dates(prev.end_date, prev.recurrence)
    try:
        with db.begin_nested():  # savepoint: a lost race must not poison the session
            budget = _start_next_cycle(db, prev)
            db.flush()
            return budget
    except IntegrityError:
        existing = (
            db.query(models.Budget)
            .filter(
                models.Budget.user_id == prev.user_id,
                models.Budget.series_id == series_key(prev),
                models.Budget.start_date == start,
            )
            .first()
        )
        if existing is None:
            raise
        return existing


def roll_over_budgets(db: Session, user_id: int, today: Optional[date] = None) -> None:
    """Start new cycles for every recurring budget whose cycle has ended,
    including any cycles that were skipped while nobody looked.

    Safe to call from concurrent requests: each cycle is created at most once.
    """
    today = today or today_local()
    changed = False
    for budget in current_cycles(db, user_id).values():
        if budget.recurrence and budget.series_id is None:
            budget.series_id = budget.id
            changed = True
        while budget.recurrence and budget.end_date < today:
            budget = _next_cycle_or_existing(db, budget)
            changed = True
    if changed:
        db.commit()


def cycle_for_date(db: Session, budget: models.Budget, on: date) -> models.Budget:
    """The cycle of budget's series that covers `on`, or budget itself if
    it isn't recurring or no cycle covers that date."""
    if not budget.recurrence or budget.start_date <= on <= budget.end_date:
        return budget
    match = (
        db.query(models.Budget)
        .filter(
            models.Budget.user_id == budget.user_id,
            models.Budget.series_id == series_key(budget),
            models.Budget.start_date <= on,
            models.Budget.end_date >= on,
        )
        .first()
    )
    return match or budget
