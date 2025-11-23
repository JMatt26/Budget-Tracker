from datetime import date
from decimal import Decimal
from typing import Optional, Literal

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.auth import get_current_user


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=schemas.SummaryResponse)
def get_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    group_by: Optional[Literal["category"]] = Query(
        None,
        description="Optional grouping for summary. Currently supports: 'category'.",
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Base filtered query for this user + date range
    base_query = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id
    )

    if start_date is not None:
        base_query = base_query.filter(models.Transaction.date >= start_date)
    if end_date is not None:
        base_query = base_query.filter(models.Transaction.date <= end_date)

    # Totals for income + expense
    income_q = base_query.filter(models.Transaction.type == "income")
    expense_q = base_query.filter(models.Transaction.type == "expense")

    total_income = income_q.with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0")

    total_expense = expense_q.with_entities(
        func.coalesce(func.sum(models.Transaction.amount), 0)
    ).scalar() or Decimal("0")

    net = total_income - total_expense

    by_category: Optional[list[schemas.CategorySummaryItem]] = None

    if group_by == "category":
        # Group by category, splitting income/expense per category
        grouped_rows = (
            db.query(
                models.Transaction.category_id,
                models.Category.name,
                func.coalesce(
                    func.sum(
                        case(
                            (models.Transaction.type == "income", models.Transaction.amount),
                            else_=0,
                        )
                    ),
                    0,
                ).label("total_income"),
                func.coalesce(
                    func.sum(
                        case(
                            (models.Transaction.type == "expense", models.Transaction.amount),
                            else_=0,
                        )
                    ),
                    0,
                ).label("total_expense"),
            )
            .outerjoin(
                models.Category,
                models.Transaction.category_id == models.Category.id,
            )
            .filter(models.Transaction.user_id == current_user.id)
        )

        if start_date is not None:
            grouped_rows = grouped_rows.filter(models.Transaction.date >= start_date)
        if end_date is not None:
            grouped_rows = grouped_rows.filter(models.Transaction.date <= end_date)

        grouped_rows = grouped_rows.group_by(
            models.Transaction.category_id, models.Category.name
        )

        results = grouped_rows.all()

        by_category = [
            schemas.CategorySummaryItem(
                category_id=row.category_id,
                category_name=row.name,
                total_income=row.total_income or Decimal("0"),
                total_expense=row.total_expense or Decimal("0"),
            )
            for row in results
        ] or None

    return schemas.SummaryResponse(
        start_date=start_date,
        end_date=end_date,
        totals=schemas.SummaryTotals(
            total_income=total_income,
            total_expense=total_expense,
            net=net,
        ),
        by_category=by_category,
    )



@router.get("/transactions/export")
def export_transactions_csv(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    category_id: Optional[int] = Query(None),
    type: Optional[Literal["income", "expense"]] = Query(None),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Export the user's transactions as CSV, honoring common filters.
    """
    query = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id
    )

    if start_date is not None:
        query = query.filter(models.Transaction.date >= start_date)
    if end_date is not None:
        query = query.filter(models.Transaction.date <= end_date)
    if category_id is not None:
        query = query.filter(models.Transaction.category_id == category_id)
    if type is not None:
        query = query.filter(models.Transaction.type == type)
    if min_amount is not None:
        query = query.filter(models.Transaction.amount >= Decimal(str(min_amount)))
    if max_amount is not None:
        query = query.filter(models.Transaction.amount <= Decimal(str(max_amount)))

    transactions = (
        query.order_by(models.Transaction.date.asc(), models.Transaction.id.asc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)

    # CSV header
    writer.writerow(
        [
            "id",
            "date",
            "amount",
            "type",
            "description",
            "category_id",
            "budget_id",
        ]
    )

    for tx in transactions:
        writer.writerow(
            [
                tx.id,
                tx.date.isoformat() if tx.date else "",
                str(tx.amount),
                tx.type,
                tx.description or "",
                tx.category_id if tx.category_id is not None else "",
                tx.budget_id if tx.budget_id is not None else "",
            ]
        )

    output.seek(0)

    headers = {
        "Content-Disposition": 'attachment; filename="transactions.csv"'
    }

    return StreamingResponse(
        output,
        media_type="text/csv",
        headers=headers,
    )
