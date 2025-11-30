from sqlalchemy import (
    Column, 
    Integer,
    String,
    Numeric,
    Date,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.orm import relationship

from .db import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
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

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    limit = Column(Numeric(10, 2), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)

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