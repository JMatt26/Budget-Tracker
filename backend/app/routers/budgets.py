from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..auth import get_current_user
from ..income_utils import monthly_income_total

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _read(budget: models.Budget, limit: Decimal) -> schemas.BudgetRead:
    """Serialize a budget with the user's monthly income as its limit."""
    return schemas.BudgetRead.model_validate(budget).model_copy(update={"limit": limit})


def _clamp_period(
    budget: models.Budget, start_date: Optional[date], end_date: Optional[date]
):
    """Clamp an optional sub-period to the budget's own range."""
    period_start = max(budget.start_date, start_date) if start_date else budget.start_date
    period_end = min(budget.end_date, end_date) if end_date else budget.end_date
    if period_start > period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be before or equal to end_date within the budget's range.",
        )
    return period_start, period_end


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
    return _read(budget, monthly_income_total(db, current_user.id))


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

    monthly_income = monthly_income_total(db, current_user.id)
    return schemas.BudgetListResponse(
        items=[_read(b, monthly_income) for b in items],
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
    return _read(budget, monthly_income_total(db, current_user.id))


@router.put("/{budget_id}", response_model=schemas.BudgetRead)
def update_budget(
    budget_id: int,
    budget_in: schemas.BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
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

    update_data = budget_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(budget, field, value)

    db.commit()
    db.refresh(budget)
    return _read(budget, monthly_income_total(db, current_user.id))


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify budget exists and belongs to user
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

    # Remove budget_id from all transactions that reference this budget
    db.query(models.Transaction).filter(
        models.Transaction.budget_id == budget_id,
        models.Transaction.user_id == current_user.id
    ).update({models.Transaction.budget_id: None})

    # Delete the budget (this will cascade delete budget_categories due to the relationship)
    db.delete(budget)
    db.commit()


@router.get("/{budget_id}/status", response_model=schemas.BudgetStatus)
def get_budget_status(
    budget_id: int,
    start_date: Optional[date] = Query(
        None,
        description="Optional sub-period start (e.g. a week within the budget). Clamped to the budget's own range.",
    ),
    end_date: Optional[date] = Query(
        None,
        description="Optional sub-period end (e.g. a week within the budget). Clamped to the budget's own range.",
    ),
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

    # Clamp the requested sub-period to the budget's own range so callers
    # can't query outside of it (e.g. a week that overlaps the next month).
    period_start = max(budget.start_date, start_date) if start_date else budget.start_date
    period_end = min(budget.end_date, end_date) if end_date else budget.end_date

    if period_start > period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be before or equal to end_date within the budget's range.",
        )

    # Prorate the limit for the requested sub-period based on its share of
    # the budget's total days, so a weekly slice of a monthly budget gets a
    # weekly-sized limit instead of the full monthly one.
    monthly_income = monthly_income_total(db, current_user.id)
    total_days = (budget.end_date - budget.start_date).days + 1
    period_days = (period_end - period_start).days + 1
    period_limit = (
        monthly_income * Decimal(period_days) / Decimal(total_days)
        if total_days > 0
        else monthly_income
    )

    # Sum of transactions within the (sub-)period, by type.
    # Only count transactions that are directly linked to this budget.
    def sum_for_type(tx_type: str) -> Decimal:
        total = (
            db.query(func.sum(models.Transaction.amount))
            .filter(models.Transaction.type == tx_type)
            .filter(models.Transaction.budget_id == budget_id)
            .filter(models.Transaction.user_id == current_user.id)
            .filter(models.Transaction.date >= period_start)
            .filter(models.Transaction.date <= period_end)
            .scalar()
        )
        return Decimal(total or 0)

    total_expense = sum_for_type("expense")
    total_investment = sum_for_type("investment")
    total_income = sum_for_type("income")

    # Saved is income left after spending and investing; remaining is what's
    # left of the limit after spending, investing and saving.
    total_saved = total_income - total_expense - total_investment
    remaining = period_limit - total_expense - total_investment - total_saved
    exceeded = remaining < 0

    return schemas.BudgetStatus(
        budget=_read(budget, monthly_income),
        period_start=period_start,
        period_end=period_end,
        period_limit=period_limit,
        total_expense=total_expense,
        total_investment=total_investment,
        total_income=total_income,
        remaining=remaining,
        exceeded=exceeded,
    )


def _get_owned_budget(db: Session, budget_id: int, user_id: int) -> models.Budget:
    budget = (
        db.query(models.Budget)
        .filter(models.Budget.id == budget_id, models.Budget.user_id == user_id)
        .first()
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )
    return budget


def _read_target(budget: models.Budget) -> schemas.BudgetTargetRead:
    target = budget.target
    return schemas.BudgetTargetRead(
        budget_id=budget.id,
        spending=target.spending if target else None,
        invested=target.invested if target else None,
        saved=target.saved if target else None,
    )


@router.get("/{budget_id}/targets", response_model=schemas.BudgetTargetRead)
def get_budget_targets(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Spending/investing/saving goals for the whole budget period."""
    return _read_target(_get_owned_budget(db, budget_id, current_user.id))


@router.put("/{budget_id}/targets", response_model=schemas.BudgetTargetRead)
def set_budget_targets(
    budget_id: int,
    target_in: schemas.BudgetTargetUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    budget = _get_owned_budget(db, budget_id, current_user.id)
    if budget.target is None:
        budget.target = models.BudgetTarget(budget_id=budget.id)
    for field, value in target_in.model_dump(exclude_unset=True).items():
        setattr(budget.target, field, value)
    db.commit()
    db.refresh(budget)
    return _read_target(budget)


@router.get(
    "/{budget_id}/expense-breakdown",
    response_model=schemas.ExpenseBreakdown,
)
def get_expense_breakdown(
    budget_id: int,
    start_date: Optional[date] = Query(None, description="Optional sub-period start, clamped to the budget."),
    end_date: Optional[date] = Query(None, description="Optional sub-period end, clamped to the budget."),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Expenses linked to this budget, grouped by category (including
    uncategorized and categories that were never added to the budget)."""
    budget = (
        db.query(models.Budget)
        .filter(
            models.Budget.id == budget_id,
            models.Budget.user_id == current_user.id,
        )
        .first()
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found.",
        )

    period_start, period_end = _clamp_period(budget, start_date, end_date)

    rows = (
        db.query(
            models.Transaction.category_id,
            models.Category.name,
            func.sum(models.Transaction.amount),
        )
        .outerjoin(models.Category, models.Transaction.category_id == models.Category.id)
        .filter(models.Transaction.type == "expense")
        .filter(models.Transaction.budget_id == budget_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.date >= period_start)
        .filter(models.Transaction.date <= period_end)
        .group_by(models.Transaction.category_id, models.Category.name)
        .all()
    )

    limits = {
        bc.category_id: bc.limit
        for bc in db.query(models.BudgetCategory).filter(
            models.BudgetCategory.budget_id == budget_id
        )
    }

    items = sorted(
        (
            schemas.ExpenseBreakdownItem(
                category_id=category_id,
                category_name=name or "Uncategorized",
                total=Decimal(total or 0),
                limit=limits.get(category_id),
            )
            for category_id, name, total in rows
        ),
        key=lambda item: item.total,
        reverse=True,
    )
    return schemas.ExpenseBreakdown(
        period_start=period_start,
        period_end=period_end,
        total_expense=sum((i.total for i in items), Decimal(0)),
        items=items,
    )


@router.post(
    "/{budget_id}/categories",
    response_model=schemas.BudgetCategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def add_category_to_budget(
    budget_id: int,
    category_in: schemas.BudgetCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify budget exists and belongs to user
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

    # Get or create category
    if category_in.category_id is not None:
        # Use existing category
        category = (
            db.query(models.Category)
            .filter(
                models.Category.id == category_in.category_id,
                models.Category.user_id == current_user.id
            )
            .first()
        )
        if category is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )
    else:
        # Create new category
        if not category_in.category_name or not category_in.category_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="category_name and category_type are required when creating a new category.",
            )
        
        # Check for duplicate name
        existing = (
            db.query(models.Category)
            .filter(
                models.Category.user_id == current_user.id,
                models.Category.name == category_in.category_name,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Category with this name already exists.",
            )
        
        category = models.Category(
            name=category_in.category_name,
            type=category_in.category_type,
            user_id=current_user.id
        )
        db.add(category)
        db.flush()  # Get the ID without committing

    # Check if category already exists in this budget
    existing_budget_category = (
        db.query(models.BudgetCategory)
        .filter(
            models.BudgetCategory.budget_id == budget_id,
            models.BudgetCategory.category_id == category.id
        )
        .first()
    )
    if existing_budget_category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category already added to this budget.",
        )

    # Create budget-category relationship
    budget_category = models.BudgetCategory(
        budget_id=budget_id,
        category_id=category.id,
        limit=category_in.limit
    )
    db.add(budget_category)
    db.commit()
    db.refresh(budget_category)
    db.refresh(category)

    # Calculate actual spending for this category in this budget
    # Only count transactions that are directly linked to this budget AND have this category
    actual_spending = (
        db.query(func.coalesce(func.sum(models.Transaction.amount), 0))
        .filter(models.Transaction.category_id == category.id)
        .filter(models.Transaction.type == "expense")
        .filter(models.Transaction.budget_id == budget_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.date >= budget.start_date)
        .filter(models.Transaction.date <= budget.end_date)
        .scalar() or Decimal("0")
    )

    return schemas.BudgetCategoryRead(
        id=budget_category.id,
        budget_id=budget_category.budget_id,
        category_id=budget_category.category_id,
        limit=budget_category.limit,
        category=category,
        actual_spending=actual_spending,
        created_at=budget_category.created_at,
        updated_at=budget_category.updated_at,
    )


@router.get("/{budget_id}/categories", response_model=List[schemas.BudgetCategoryRead])
def get_budget_categories(
    budget_id: int,
    start_date: Optional[date] = Query(None, description="Optional sub-period start, clamped to the budget."),
    end_date: Optional[date] = Query(None, description="Optional sub-period end, clamped to the budget."),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify budget exists and belongs to user
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

    period_start, period_end = _clamp_period(budget, start_date, end_date)

    # Get all budget categories
    budget_categories = (
        db.query(models.BudgetCategory)
        .filter(models.BudgetCategory.budget_id == budget_id)
        .all()
    )

    result = []
    for bc in budget_categories:
        # Calculate actual spending for this category in this budget
        # Only count transactions that are directly linked to this budget AND have this category
        actual_spending = (
            db.query(func.coalesce(func.sum(models.Transaction.amount), 0))
            .filter(models.Transaction.category_id == bc.category_id)
            .filter(models.Transaction.type == "expense")
            .filter(models.Transaction.budget_id == budget_id)
            .filter(models.Transaction.user_id == current_user.id)
            .filter(models.Transaction.date >= period_start)
            .filter(models.Transaction.date <= period_end)
            .scalar() or Decimal("0")
        )

        result.append(schemas.BudgetCategoryRead(
            id=bc.id,
            budget_id=bc.budget_id,
            category_id=bc.category_id,
            limit=bc.limit,
            category=bc.category,
            actual_spending=actual_spending,
            created_at=bc.created_at,
            updated_at=bc.updated_at,
        ))

    return result


@router.put("/{budget_id}/categories/{budget_category_id}", response_model=schemas.BudgetCategoryRead)
def update_budget_category(
    budget_id: int,
    budget_category_id: int,
    category_in: schemas.BudgetCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify budget exists and belongs to user
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

    # Find and update budget category
    budget_category = (
        db.query(models.BudgetCategory)
        .filter(
            models.BudgetCategory.id == budget_category_id,
            models.BudgetCategory.budget_id == budget_id
        )
        .first()
    )
    if budget_category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found in this budget.",
        )

    update_data = category_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(budget_category, field, value)

    db.commit()
    db.refresh(budget_category)

    # Calculate actual spending
    actual_spending = (
        db.query(func.coalesce(func.sum(models.Transaction.amount), 0))
        .filter(models.Transaction.category_id == budget_category.category_id)
        .filter(models.Transaction.type == "expense")
        .filter(models.Transaction.budget_id == budget_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.date >= budget.start_date)
        .filter(models.Transaction.date <= budget.end_date)
        .scalar() or Decimal("0")
    )

    return schemas.BudgetCategoryRead(
        id=budget_category.id,
        budget_id=budget_category.budget_id,
        category_id=budget_category.category_id,
        limit=budget_category.limit,
        category=budget_category.category,
        actual_spending=actual_spending,
        created_at=budget_category.created_at,
        updated_at=budget_category.updated_at,
    )


@router.delete("/{budget_id}/categories/{budget_category_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_category_from_budget(
    budget_id: int,
    budget_category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify budget exists and belongs to user
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

    # Find and delete budget category
    budget_category = (
        db.query(models.BudgetCategory)
        .filter(
            models.BudgetCategory.id == budget_category_id,
            models.BudgetCategory.budget_id == budget_id
        )
        .first()
    )
    if budget_category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found in this budget.",
        )

    db.delete(budget_category)
    db.commit()


@router.get("/{budget_id}/categories/{budget_category_id}/transactions", response_model=schemas.TransactionListResponse)
def get_budget_category_transactions(
    budget_id: int,
    budget_category_id: int,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify budget exists and belongs to user
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

    # Verify budget category exists
    budget_category = (
        db.query(models.BudgetCategory)
        .filter(
            models.BudgetCategory.id == budget_category_id,
            models.BudgetCategory.budget_id == budget_id
        )
        .first()
    )
    if budget_category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found in this budget.",
        )

    # Get transactions for this budget and category
    # Only include transactions that are directly linked to this budget AND have this category
    query = (
        db.query(models.Transaction)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.category_id == budget_category.category_id)
        .filter(models.Transaction.type == "expense")
        .filter(models.Transaction.budget_id == budget_id)
        .filter(models.Transaction.date >= budget.start_date)
        .filter(models.Transaction.date <= budget.end_date)
    )

    total = query.count()
    items = (
        query.order_by(models.Transaction.date.desc(), models.Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return schemas.TransactionListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )
