from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.status import HTTP_204_NO_CONTENT
from datetime import date

from .. import models, schemas
from ..db import get_db
from ..auth import get_current_user
from ..budget_cycles import cycle_for_date, roll_over_budgets

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _budget_cycle_id(db: Session, user_id: int, budget_id: Optional[int], tx_date: date) -> Optional[int]:
    """A transaction linked to a recurring budget belongs to the cycle that
    covers its date, so it doesn't land in an old (or the wrong) cycle."""
    if budget_id is None:
        return None
    roll_over_budgets(db, user_id)
    budget = (
        db.query(models.Budget)
        .filter(models.Budget.id == budget_id, models.Budget.user_id == user_id)
        .first()
    )
    if budget is None:
        # never accept a budget that isn't the caller's (or doesn't exist)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Budget does not exist.",
        )
    return cycle_for_date(db, budget, tx_date).id


def _user_categories(db: Session, user_id: int, category_ids: List[int]) -> List[models.Category]:
    """The caller's categories for these ids; any id that isn't theirs (or
    doesn't exist) rejects the whole request."""
    wanted = set(category_ids)
    if not wanted:
        return []
    categories = (
        db.query(models.Category)
        .filter(models.Category.id.in_(wanted), models.Category.user_id == user_id)
        .all()
    )
    if len(categories) != len(wanted):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category does not exist.",
        )
    return categories


def _build_transaction(db: Session, user_id: int, tx_in: schemas.TransactionCreate) -> models.Transaction:
    """A new, unsaved transaction, after checking its categories and budget
    belong to the user."""
    categories = _user_categories(db, user_id, tx_in.category_ids)

    tx_data = tx_in.model_dump(exclude={"category_ids"})
    tx_data["budget_id"] = _budget_cycle_id(db, user_id, tx_in.budget_id, tx_in.date)
    return models.Transaction(**tx_data, categories=categories, user_id=user_id)


def _first_error(exc: ValidationError) -> str:
    err = exc.errors()[0]
    message = err["msg"].removeprefix("Value error, ")
    field = ".".join(str(part) for part in err["loc"])
    return f"{field}: {message}" if field else message


@router.post(
    "/",
    response_model=schemas.TransactionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    tx_in: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tx = _build_transaction(db, current_user.id, tx_in)

    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.post(
    "/bulk",
    response_model=List[schemas.TransactionRead],
    status_code=status.HTTP_201_CREATED,
)
def create_transactions_bulk(
    body: schemas.TransactionBulkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Save many transactions at once (a reviewed statement import). All or
    nothing: the first invalid item rejects the request, naming its row
    (1-based, in the order sent)."""
    txs = []
    for row, raw in enumerate(body.items, start=1):
        try:
            tx_in = schemas.TransactionCreate.model_validate(raw)
            txs.append(_build_transaction(db, current_user.id, tx_in))
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Row {row}: {_first_error(exc)}",
            )
        except HTTPException as exc:
            raise HTTPException(status_code=exc.status_code, detail=f"Row {row}: {exc.detail}")

    db.add_all(txs)
    db.commit()
    for tx in txs:
        db.refresh(tx)
    return txs



@router.get("/", response_model=schemas.TransactionListResponse)
def list_transactions(
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    category_id: Optional[int] = Query(None),
    type: Optional[Literal["income", "expense", "investment"]] = Query(None),
    budget_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    min_amount: Optional[float] = Query(None),
    max_amount: Optional[float] = Query(None),
):
    query = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id
    )

    if start_date is not None:
        query = query.filter(models.Transaction.date >= start_date)
    if end_date is not None:
        query = query.filter(models.Transaction.date <= end_date)
    if min_amount is not None:
        query = query.filter(models.Transaction.amount >= min_amount)
    if max_amount is not None:
        query = query.filter(models.Transaction.amount <= max_amount)
    if category_id is not None:
        query = query.filter(models.Transaction.categories.any(models.Category.id == category_id))
    if type is not None:
        query = query.filter(models.Transaction.type == type)
    if budget_id is not None:
        query = query.filter(models.Transaction.budget_id == budget_id)

    total = query.count()
    items = (
        query.order_by(models.Transaction.date.desc(), models.Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return schemas.TransactionListResponse(
        items = items,
        total = total,
        limit = limit,
        offset = offset
    )


@router.get("/{transaction_id}", response_model=schemas.TransactionRead)
def get_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    tx = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.id == transaction_id,
            models.Transaction.user_id == current_user.id,
            )
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
    current_user: models.User = Depends(get_current_user)
):
    tx = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.id == transaction_id,
            models.Transaction.user_id == current_user.id
            )
        .first()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )

    update_data = tx_update.model_dump(exclude_unset=True)

    # Validate categories if updated
    if "category_ids" in update_data:
        tx.categories = _user_categories(db, current_user.id, update_data.pop("category_ids") or [])

    # An expense must always carry a payment method; other types never do.
    final_type = update_data.get("type", tx.type)
    final_method = update_data.get("payment_method", tx.payment_method)
    if final_type == "expense":
        if final_method is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="payment_method is required for expenses.",
            )
    else:
        update_data["payment_method"] = None

    if "budget_id" in update_data or "date" in update_data:
        update_data["budget_id"] = _budget_cycle_id(
            db,
            current_user.id,
            update_data.get("budget_id", tx.budget_id),
            update_data.get("date", tx.date),
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
    current_user: models.User = Depends(get_current_user)
):
    tx = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.id == transaction_id,
            models.Transaction.user_id == current_user.id
            )
        .first()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    
    db.delete(tx)
    db.commit()