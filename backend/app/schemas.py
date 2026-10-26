from datetime import datetime, date as DateType
from typing import Literal, Optional, List
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_serializer, model_validator
from decimal import Decimal


class CategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    type: Optional[str] = Field(..., pattern="^(income|expense|investment)$")


class CategoryCreate(CategoryBase):
    pass


class CategoryRead(CategoryBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    type: Optional[str] = Field(None, pattern="^(income|expense|investment)$")


PaymentMethod = Literal["Amex", "Visa", "Debit", "Cash"]


class TransactionBase(BaseModel):
    amount: Decimal = Field(..., max_digits=10, decimal_places=2)
    description: Optional[str] = Field(None, max_length=255)
    date: DateType
    type: str = Field(..., pattern="^(income|expense|investment)$")
    category_id: Optional[int] = None
    budget_id: Optional[int] = None
    payment_method: Optional[PaymentMethod] = None


class SummaryTotals(BaseModel):
    total_income: Decimal
    total_investment: Decimal
    total_expense: Decimal
    net: Decimal


class CategorySummaryItem(BaseModel):
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    total_income: Decimal
    total_investment: Decimal
    total_expense: Decimal


class SummaryResponse(BaseModel):
    start_date: DateType | None = None
    end_date: DateType | None = None
    totals: SummaryTotals
    by_category: Optional[List[CategorySummaryItem]] = None


class BudgetBase(BaseModel):
    name: str = Field(..., max_length=100)
    start_date: DateType
    end_date: DateType


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    start_date: Optional[DateType] = None
    end_date: Optional[DateType] = None


class BudgetCore(BudgetBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BudgetRead(BudgetCore):
    # Not stored: always the user's current total monthly income.
    limit: Decimal


class BudgetStatus(BaseModel):
    budget: BudgetRead
    period_start: DateType
    period_end: DateType
    period_limit: Decimal
    total_expense: Decimal
    total_investment: Decimal
    total_income: Decimal
    remaining: Decimal
    exceeded: bool


class ExpenseBreakdownItem(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    total: Decimal
    limit: Optional[Decimal] = None  # the category's limit in this budget, if it has one


class ExpenseBreakdown(BaseModel):
    period_start: DateType
    period_end: DateType
    total_expense: Decimal
    items: List[ExpenseBreakdownItem]


class BudgetCategoryCreate(BaseModel):
    category_id: Optional[int] = None  # If None, create new category
    category_name: Optional[str] = Field(None, max_length=100)  # For new category
    category_type: Optional[str] = Field(None, pattern="^(income|expense|investment)$")  # For new category
    limit: Decimal = Field(..., max_digits=10, decimal_places=2)


class BudgetCategoryUpdate(BaseModel):
    limit: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2)


class BudgetCategoryRead(BaseModel):
    id: int
    budget_id: int
    category_id: int
    limit: Decimal
    category: CategoryRead
    actual_spending: Decimal  # Calculated from transactions
    created_at: datetime
    updated_at: datetime


class BudgetTargetUpdate(BaseModel):
    # null clears a goal
    spending: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2, ge=0)
    invested: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2, ge=0)
    saved: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2, ge=0)


class BudgetTargetRead(BaseModel):
    budget_id: int
    spending: Optional[Decimal] = None
    invested: Optional[Decimal] = None
    saved: Optional[Decimal] = None


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TransactionCreate(TransactionBase):
    @model_validator(mode="after")
    def check_payment_method(self):
        if self.type == "expense":
            if self.payment_method is None:
                raise ValueError("payment_method is required for expenses.")
        else:
            self.payment_method = None
        return self


class TransactionRead(TransactionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryRead] = None
    budget: Optional[BudgetCore] = None

    @field_serializer("amount")
    def serialize_amount(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class TransactionUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2)
    description: Optional[str] = Field(None, max_length=255)
    date: Optional[DateType] = None
    type: Optional[str] = Field(None, pattern="^(income|expense|investment)$")
    category_id: Optional[int] = None
    budget_id: Optional[int] = None
    payment_method: Optional[PaymentMethod] = None


class IncomeBase(BaseModel):
    name: str = Field("Income", min_length=1, max_length=100)
    amount: Decimal = Field(..., max_digits=10, decimal_places=2, gt=0)
    frequency: str = Field(..., pattern="^(weekly|biweekly|semimonthly|monthly|yearly)$")


class IncomeCreate(IncomeBase):
    pass


class IncomeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[Decimal] = Field(None, max_digits=10, decimal_places=2, gt=0)
    frequency: Optional[str] = Field(None, pattern="^(weekly|biweekly|semimonthly|monthly|yearly)$")


class IncomeRead(IncomeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    @field_serializer("amount")
    def serialize_amount(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    sub: Optional[str] = None  # subject = user email


class PaginatedResponseBase(BaseModel):
    total: int
    limit: int
    offset: int


class TransactionListResponse(PaginatedResponseBase):
    items: List[TransactionRead]


class BudgetListResponse(PaginatedResponseBase):
    items: List[BudgetRead]


class CategoryListResponse(PaginatedResponseBase):
    items: List[CategoryRead]


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
