from collections import defaultdict
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..auth import get_current_user
from ..budget_cycles import current_cycles, roll_over_budgets, series_key
from ..db import get_db
from ..statement_import import MAX_BYTES, StatementError, normalize_description, parse_statement

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/statement/preview", response_model=schemas.StatementPreview)
def preview_statement(
    file: UploadFile = File(...),
    kind: schemas.StatementKind = Form("credit"),
    payment_method: Optional[schemas.PaymentMethod] = Form(None),
    mapping: Optional[str] = Form(None, description="JSON ColumnMapping, to override detection"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Read a statement CSV into rows for the user to review. Nothing is
    saved; the reviewed rows go to POST /transactions/bulk."""
    column_mapping = None
    if mapping:
        try:
            column_mapping = schemas.ColumnMapping.model_validate_json(mapping)
        except ValidationError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid column mapping.",
            )

    data = file.file.read(MAX_BYTES + 1)
    try:
        parsed = parse_statement(data, kind=kind, mapping=column_mapping)
    except StatementError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    rows = [
        schemas.StatementRow(
            index=r.index,
            date=r.date,
            description=r.description,
            amount=r.amount,
            type=r.type,
            payment_method=payment_method if r.type == "expense" else None,
            selected=r.warning is None,
            warning=r.warning,
        )
        for r in parsed.rows
    ]
    _flag_duplicates(db, current_user.id, rows)
    _suggest_from_history(db, current_user.id, rows)

    return schemas.StatementPreview(columns=parsed.columns, mapping=parsed.mapping, rows=rows)


def _flag_duplicates(db: Session, user_id: int, rows: List[schemas.StatementRow]) -> None:
    """Mark rows that match a saved transaction: same date, amount and type,
    and the same description (or the saved one has none). Each saved
    transaction matches at most one row, so two identical coffees on a
    statement aren't both hidden by one that's already saved."""
    dates = [r.date for r in rows if r.date]
    if not dates:
        return
    existing: Dict[Tuple, List[str]] = defaultdict(list)
    for tx in db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.date >= min(dates),
        models.Transaction.date <= max(dates),
    ):
        key = (tx.date, Decimal(tx.amount), tx.type)
        existing[key].append(normalize_description(tx.description))

    for row in rows:
        if row.date is None or row.amount is None:
            continue
        candidates = existing.get((row.date, row.amount, row.type))
        if not candidates:
            continue
        description = normalize_description(row.description)
        match = next((c for c in candidates if c == description or c == ""), None)
        if match is not None:
            candidates.remove(match)
            row.duplicate = True
            row.selected = False


def _suggest_from_history(db: Session, user_id: int, rows: List[schemas.StatementRow]) -> None:
    """Pre-fill categories and budget from the user's latest transaction
    with the same description."""
    wanted = {normalize_description(r.description) for r in rows} - {""}
    if not wanted:
        return

    latest: Dict[str, models.Transaction] = {}
    history = (
        db.query(models.Transaction)
        .options(selectinload(models.Transaction.categories), selectinload(models.Transaction.budget))
        .filter(models.Transaction.user_id == user_id, models.Transaction.description.isnot(None))
        .order_by(models.Transaction.date.desc(), models.Transaction.id.desc())
    )
    for tx in history:
        key = normalize_description(tx.description)
        if key in wanted and key not in latest:
            latest[key] = tx

    roll_over_budgets(db, user_id)
    cycles = current_cycles(db, user_id)

    for row in rows:
        past = latest.get(normalize_description(row.description))
        if past is None:
            continue
        row.category_ids = past.category_ids
        if past.budget is not None:
            # the budget list shows each series' current cycle; saving maps
            # it to the cycle that covers the row's date
            current = cycles.get(series_key(past.budget))
            row.budget_id = current.id if current else None
