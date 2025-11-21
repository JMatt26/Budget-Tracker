from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.post(
    "/",
    response_model=schemas.BudgetRead,
    status_code=status.HTTP_201_CREATED,
)
def create_budget(
    budget_in: schemas.BudgetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    budget = models.Budget(
        **budget_in.model_dump(), user_id=current_user.id
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.get("/", response_model=schemas.BudgetListResponse)
def list_budgets(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Budget).filter(
        models.Budget.user_id == current_user.id
    )

    total = query.count()

    # Sort most recent budgets first; fall back on id
    items = (
        query.order_by(
            models.Budget.start_date.desc(), 
            models.Budget.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    return schemas.BudgetListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )




@router.get("/{budget_id}", response_model=schemas.BudgetRead)
def get_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    budget = (
        db.query(models.Budget)
        .filter(
            models.Budget.id == budget_id,
            models.Budget.user_id == current_user.id
            )
        .first()
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )
    return budget


@router.get("/{budget_id}/status", response_model=schemas.BudgetStatus)
def get_budget_status(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    budget = (
        db.query(models.Budget)
        .filter(
            models.Budget.id == budget_id,
            models.Budget.user_id == current_user.id
            )
        .first()
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )

    # Sum of expense transactions within the budget period and linked to this budget
    total_expense_raw = (
        db.query(func.sum(models.Transaction.amount))
        .filter(models.Transaction.type == "expense")
        .filter(models.Transaction.budget_id == budget_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.date >= budget.start_date)
        .filter(models.Transaction.date <= budget.end_date)
        .scalar()
    )

    total_expense = Decimal(total_expense_raw or 0)
    remaining = Decimal(budget.limit) - total_expense
    exceeded = remaining < 0

    return schemas.BudgetStatus(
        budget=budget,
        total_expense=total_expense,
        remaining=remaining,
        exceeded=exceeded,
    )
