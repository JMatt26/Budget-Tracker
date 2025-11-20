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
from sqlmodel import null

from app.routers import transactions

from .db import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    type = Column(String(20), nullable=False) # e.g. income or expense

    transactions = relationship("Transaction", back_populates="category")

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
    transactions = relationship("Transaction", back_populates="budget")
