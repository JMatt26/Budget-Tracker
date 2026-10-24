from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/income", tags=["income"])


@router.get("/", response_model=Optional[schemas.IncomeRead])
def get_income(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Income)
        .filter(models.Income.user_id == current_user.id)
        .first()
    )


@router.put("/", response_model=schemas.IncomeRead)
def upsert_income(
    income_in: schemas.IncomeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    income = (
        db.query(models.Income)
        .filter(models.Income.user_id == current_user.id)
        .first()
    )

    if income is None:
        income = models.Income(**income_in.model_dump(), user_id=current_user.id)
        db.add(income)
    else:
        for field, value in income_in.model_dump().items():
            setattr(income, field, value)

    db.commit()
    db.refresh(income)
    return income


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_income(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    income = (
        db.query(models.Income)
        .filter(models.Income.user_id == current_user.id)
        .first()
    )
    if income is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Income not found.",
        )

    db.delete(income)
    db.commit()
