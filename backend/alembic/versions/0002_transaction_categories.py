"""transactions can have several categories

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('transaction_categories',
    sa.Column('transaction_id', sa.Integer(), nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('transaction_id', 'category_id')
    )
    with op.batch_alter_table('transaction_categories', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_transaction_categories_category_id'), ['category_id'], unique=False)

    # each transaction keeps the one category it had
    op.execute(
        "INSERT INTO transaction_categories (transaction_id, category_id) "
        "SELECT id, category_id FROM transactions WHERE category_id IS NOT NULL"
    )

    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_column('category_id')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('category_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_transactions_category_id_categories', 'categories', ['category_id'], ['id'])

    # a single column can only hold one category; keep the lowest id
    op.execute(
        "UPDATE transactions SET category_id = ("
        "SELECT MIN(category_id) FROM transaction_categories "
        "WHERE transaction_categories.transaction_id = transactions.id)"
    )

    with op.batch_alter_table('transaction_categories', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_transaction_categories_category_id'))

    op.drop_table('transaction_categories')
