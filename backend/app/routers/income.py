from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/income", tags=["income"])


def _get_owned_income(db: Session, income_id: int, user: models.User) -> models.Income:
    income = (
        db.query(models.Income)
        .filter(models.Income.id == income_id, models.Income.user_id == user.id)
        .first()
    )
    if income is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Income not found.",
        )
    return income


@router.get("/", response_model=List[schemas.IncomeRead])
def list_incomes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Income)
        .filter(models.Income.user_id == current_user.id)
        .order_by(models.Income.id)
        .all()
    )


@router.post("/", response_model=schemas.IncomeRead, status_code=status.HTTP_201_CREATED)
def create_income(
    income_in: schemas.IncomeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    income = models.Income(**income_in.model_dump(), user_id=current_user.id)
    db.add(income)
    db.commit()
    db.refresh(income)
    return income


@router.put("/{income_id}", response_model=schemas.IncomeRead)
def update_income(
    income_id: int,
    income_in: schemas.IncomeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    income = _get_owned_income(db, income_id, current_user)
    for field, value in income_in.model_dump(exclude_unset=True).items():
        setattr(income, field, value)
    db.commit()
    db.refresh(income)
    return income


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_income(
    income_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    income = _get_owned_income(db, income_id, current_user)
    db.delete(income)
    db.commit()
