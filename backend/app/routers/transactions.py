from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session
from starlette.status import HTTP_204_NO_CONTENT

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post(
    "/",
    response_model=schemas.TransactionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    tx_in: schemas.TransactionCreate, 
    db: Session = Depends(get_db)
):
    if tx_in.category_id is not None:
        category = (
            db.query(models.Category)
            .filter(models.Category.id == tx_in.category_id)
            .first()
        )
        if category is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Category does not exist."
            )

    tx = models.Transaction(**tx_in.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get("/", response_model=List[schemas.TransactionRead])
def list_transactions(
    db: Session = Depends(get_db),
    type: Optional[str] = None,
    category_id: Optional[int] = None
):
    query = db.query(models.Transaction)

    if type is not None:
        query = query.filter(models.Transaction.type == type)
    
    if category_id is not None:
        query = query.filter(models.Transaction.category_id == category_id)
    
    return query.order_by(models.Transaction.date.desc()).all()


@router.get("/{transaction_id}", response_model=schemas.TransactionRead)
def get_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
):
    tx = (
        db.query(models.Transaction)
        .filter(models.Transaction.id == transaction_id)
        .first()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found."
        )
    return tx


@router.put("/{transaction_id}", response_model=schemas.TransactionRead)
def update_transaction(
    transaction_id: int,
    tx_update: schemas.TransactionUpdate,
    db: Session = Depends(get_db),
):
    tx = (
        db.query(models.Transaction)
        .filter(models.Transaction.id == transaction_id)
        .first()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )

    update_data = tx_update.model_dump(exclude_unset=True)

    # Validate category if updated
    if "category_id" in update_data and update_data["category_id"] is not None:
        category = db.query(models.Category).filter(
            models.Category.id == update_data["category_id"]
        ).first()
        if category is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cateogry does not exist.",
            )

    for field, value in update_data.items():
        setattr(tx, field, value)

    db.commit()
    db.refresh(tx)
    return tx


@router.delete(
    "/{transaction_id}",
    status_code=HTTP_204_NO_CONTENT,
)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
):
    tx = (
        db.query(models.Transaction)
        .filter(models.Transaction.id == transaction_id)
        .first()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    
    db.delete(tx)
    db.commit()