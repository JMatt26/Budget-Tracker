from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, PositiveFloat

class TransactionCreate(BaseModel):
    amount: PositiveFloat
    currency: str = Field(default="CAD", min_length=3, max_length=3)
    payment_method: str = Field(pattern=r"^(debit|credit|cash)$")
    account: str = "default"
    category: Optional[str] = None
    merchant: Optional[str] = None
    description: Optional[str] = None

class TransactionRead(TransactionCreate):
    id: int
    ts: datetime

