from decimal import Decimal

from sqlalchemy.orm import Session

from . import models

PERIODS_PER_YEAR = {
    "weekly": 52,
    "biweekly": 26,
    "semimonthly": 24,
    "monthly": 12,
    "yearly": 1,
}


def monthly_income_total(db: Session, user_id: int) -> Decimal:
    """Combined monthly equivalent of all of the user's income sources."""
    incomes = db.query(models.Income).filter(models.Income.user_id == user_id).all()
    yearly = sum(
        (Decimal(i.amount) * PERIODS_PER_YEAR[i.frequency] for i in incomes),
        Decimal(0),
    )
    return (yearly / 12).quantize(Decimal("0.01"))
