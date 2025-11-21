from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post(
    "/",
    response_model=schemas.CategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    category_in: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = (
        db.query(models.Category)
        .filter(
            models.Category.user_id == current_user.id,
            models.Category.name == category_in.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category with this name already exists.",
        )

    category = models.Category(
        **category_in.model_dump(), user_id=current_user.id
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/", response_model=schemas.CategoryListResponse)
def list_categories(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    search: Optional[str] = Query(None)
):

    query = db.query(models.Category).filter(
        models.Category.user_id == current_user.id
    )

    if search:
        query = query.filter(models.Category.name.ilike(f"%{search}%"))

    total = query.count()

    items = (
        query.order_by(models.Category.name.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return schemas.CategoryListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/{category_id}", response_model=schemas.CategoryRead)
def get_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    category = (
        db.query(models.Category)
        .filter(
            models.Category.id == category_id,
            models.Category.user_id == current_user.id
            )
        .first()
    )
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found.",
        )
    return category


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    category = (
        db.query(models.Category)
        .filter(
            models.Category.id == category_id,
            models.Category.user_id == current_user.id
            )
        .first()
    )
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found.",
        )

    # Optional: prevent delete if there are transactions
    tx_exists = (
        db.query(models.Transaction)
        .filter(models.Transaction.category_id == category_id)
        .first()
    )
    if tx_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete category with existing transactions.",
        )

    db.delete(category)
    db.commit()
