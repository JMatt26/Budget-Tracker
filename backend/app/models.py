from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=datetime.now, index=True)
    amount: float
    currency: str = "CAD"
    payment_method: str 
    account: str
    category: Optional[str] = None
    merchant: Optional[str] = None
    description: Optional[str] = None


