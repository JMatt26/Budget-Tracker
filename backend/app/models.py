from sqlalchemy import (
    Column, 
    Integer,
    String,
    Numeric,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from .db import Base


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True, nullable=False)
    type = Column(String(20), nullable=False) # e.g. income or expense

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="categories")

    transactions = relationship(
        "Transaction",
        back_populates="category",
        cascade="all, delete-orphan",
    )

    # many-to-many: a category can be in many budgets with different limits
    budget_categories = relationship(
        "BudgetCategory",
        back_populates="category",
        cascade="all, delete-orphan",
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Numeric(10,2), nullable=False)
    description = Column(String(255), nullable=True)
    date = Column(Date, nullable=False)

    # Optional tag
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category = relationship("Category", back_populates="transactions")

    # Optional link to budget
    budget_id = Column(Integer, ForeignKey("budgets.id"), nullable=True)
    budget = relationship("Budget", back_populates="transactions")

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="transactions")

    type = Column(String(20), nullable=False)

    # Amex | Visa | Debit | Cash; required for expenses, null otherwise
    payment_method = Column(String(20), nullable=True)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
        )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        # A series gets one cycle per start date, so concurrent requests that
        # both roll a recurring budget over can't create duplicate cycles.
        UniqueConstraint("series_id", "start_date", name="uq_budgets_series_start"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    limit = Column(Numeric(10, 2), nullable=False, default=0)  # legacy; the effective limit is the user's monthly income
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)

    # weekly | monthly: a new cycle starts when this one ends; null = one-off
    recurrence = Column(String(20), nullable=True)
    # Cycles of one recurring budget share a series_id (the first cycle's id).
    # The cycle with the latest start_date is the current one.
    series_id = Column(Integer, index=True, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="budgets")

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # one-to-many: a budget can have many transactions
    transactions = relationship(
        "Transaction",
        back_populates="budget",
        cascade="all, delete-orphan",
    )

    # many-to-many: a budget can have many categories with limits
    budget_categories = relationship(
        "BudgetCategory",
        back_populates="budget",
        cascade="all, delete-orphan",
    )

    # one-to-one: optional spending/investing/saving goals for the budget
    target = relationship(
        "BudgetTarget",
        back_populates="budget",
        uselist=False,
        cascade="all, delete-orphan",
    )


class BudgetCategory(Base):
    __tablename__ = "budget_categories"

    id = Column(Integer, primary_key=True, index=True)
    budget_id = Column(Integer, ForeignKey("budgets.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    limit = Column(Numeric(10, 2), nullable=False)  # Max spending for this category in this budget

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    budget = relationship("Budget", back_populates="budget_categories")
    category = relationship("Category", back_populates="budget_categories")


class BudgetTarget(Base):
    __tablename__ = "budget_targets"

    id = Column(Integer, primary_key=True, index=True)
    budget_id = Column(Integer, ForeignKey("budgets.id"), unique=True, index=True, nullable=False)
    # Goals for the whole budget period; null means no goal set
    spending = Column(Numeric(10, 2), nullable=True)  # a ceiling: spend at most this
    invested = Column(Numeric(10, 2), nullable=True)  # invest at least this
    saved = Column(Numeric(10, 2), nullable=True)  # save at least this

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    budget = relationship("Budget", back_populates="target")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    transactions = relationship(
        "Transaction",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    categories = relationship(
        "Category",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    budgets = relationship(
        "Budget",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    incomes = relationship(
        "Income",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Income(Base):
    __tablename__ = "incomes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, default="Income")
    amount = Column(Numeric(10, 2), nullable=False)
    frequency = Column(String(20), nullable=False)  # weekly | biweekly | semimonthly | monthly | yearly

    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    user = relationship("User", back_populates="incomes")

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )