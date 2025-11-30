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

    # Sum of expense transactions within the budget period
    # Only count transactions that are directly linked to this budget
    query = (
        db.query(func.sum(models.Transaction.amount))
        .filter(models.Transaction.type == "expense")
        .filter(models.Transaction.budget_id == budget_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.date >= budget.start_date)
        .filter(models.Transaction.date <= budget.end_date)
    )
    
    total_expense_raw = query.scalar()

    total_expense = Decimal(total_expense_raw or 0)
    remaining = Decimal(budget.limit) - total_expense
    exceeded = remaining < 0

    return schemas.BudgetStatus(
        budget=budget,
        total_expense=total_expense,
        remaining=remaining,
        exceeded=exceeded,
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
            .filter(models.Transaction.budget_id == budget_id)
            .filter(models.Transaction.user_id == current_user.id)
            .filter(models.Transaction.date >= budget.start_date)
            .filter(models.Transaction.date <= budget.end_date)
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
