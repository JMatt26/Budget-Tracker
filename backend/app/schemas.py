from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from decimal import Decimal


class CategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    type: str = Field(..., pattern="^(income|expense)$")


class CategoryCreate(CategoryBase):
    pass


class CategoryRead(CategoryBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TransactionBase(BaseModel):
    amount: Decimal = Field(..., max_digits=10, decimal_places=2)
    description: Optional[str] = Field(None, max_length=255)
    date: date
    type: str = Field(..., pattern="^(income|expense)$")
    category_id: Optional[int] = None
    budget_id: Optional[int] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionRead(TransactionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryRead] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2)
    description: Optional[str] = Field(None, max_length=255)
    date: Optional[date] = None
    type: Optional[str] = Field(None, pattern="^(income|expense)$")
    category_id: Optional[int] = None
    budget_id: Optional[int] = None


class SummaryTotals(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    net: Decimal


class SummaryResponse(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    totals: SummaryTotals


class BudgetBase(BaseModel):
    name: str = Field(..., max_length=100)
    limit: Decimal = Field(..., max_digits=10, decimal_places=2)
    start_date: date
    end_date: date


class BudgetCreate(BudgetBase):
    pass


class BudgetRead(BudgetBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BudgetStatus(BaseModel):
    budget: BudgetRead
    total_expense: Decimal
    remaining: Decimal
    exceeded: bool


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    sub: Optional[str] = None  # subject = user email