from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=schemas.SummaryResponse)
def get_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    """
    Returns total income, total expense, and net amount
    over an optional date range.
    """

    base_query = db.query(models.Transaction)

    if start_date is not None:
        base_query = base_query.filter(models.Transaction.date >= start_date)
    if end_date is not None:
        base_query = base_query.filter(models.Transaction.date <= end_date)

    income_sum = (
        base_query.filter(models.Transaction.type == "income")
        .with_entities(func.sum(models.Transaction.amount))
        .scalar()
    )

    expense_sum = (
        base_query.filter(models.Transaction.type == "expense")
        .with_entities(func.sum(models.Transaction.amount))
        .scalar()
    )

    total_income = Decimal(income_sum or 0)
    total_expense = Decimal(expense_sum or 0)
    net = total_income - total_expense

    return schemas.SummaryResponse(
        start_date=start_date,
        end_date=end_date,
        totals=schemas.SummaryTotals(
            total_income=total_income,
            total_expense=total_expense,
            net=net,
        ),
    )
