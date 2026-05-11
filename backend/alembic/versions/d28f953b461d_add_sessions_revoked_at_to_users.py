"""add sessions_revoked_at to users

Revision ID: d28f953b461d
Revises: 013_optimistic_locking
Create Date: 2026-05-10 21:46:30.023478
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd28f953b461d'
down_revision: Union[str, None] = '013_optimistic_locking'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('sessions_revoked_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'sessions_revoked_at')
