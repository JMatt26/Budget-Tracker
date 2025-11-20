from datetime import date
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.post(
    "/",
    response_model=schemas.BudgetRead,
    status_code=status.HTTP_201_CREATED,
)
def create_budget(
    budget_in: schemas.BudgetCreate,
    db: Session = Depends(get_db),
):
    budget = models.Budget(**budget_in.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.get("/", response_model=List[schemas.BudgetRead])
def list_budgets(
    db: Session = Depends(get_db),
):
    return db.query(models.Budget).order_by(models.Budget.start_date.desc()).all()


@router.get("/{budget_id}", response_model=schemas.BudgetRead)
def get_budget(
    budget_id: int,
    db: Session = Depends(get_db),
):
    budget = (
        db.query(models.Budget)
        .filter(models.Budget.id == budget_id)
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
):
    budget = (
        db.query(models.Budget)
        .filter(models.Budget.id == budget_id)
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
