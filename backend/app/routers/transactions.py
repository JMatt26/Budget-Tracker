from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Transaction
from ..schemas import TransactionCreate, TransactionRead

router = APIRouter()

@router.post("", response_model=TransactionRead, status_code=201)
async def create_tx(payload: TransactionCreate, session: AsyncSession = Depends(get_session)):
    tx = Transaction(**payload.model_dump())
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx

@router.get("", response_model=List[TransactionRead])
async def list_tx(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Transaction).order_by(Transaction.ts.desc()).limit(200)
    )
    return list(result.scalars())