"""defence and kicking season totals

Revision ID: 2ffdb26b7f94
Revises: 7074777b8245
Create Date: 2026-11-19 14:28:12.341267

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2ffdb26b7f94'
down_revision = '7074777b8245'
branch_labels = None
depends_on = None

# Every column is NOT NULL with a SERVER default of zero. Autogenerate
# emitted NOT NULL with no default at all, which fails outright on a table
# that already holds rows (19,521 player-seasons on the box): Postgres has
# nothing to put in the existing rows. Zero is also the honest value until
# the re-ingest lands — the same zero a receiver carries in passing_yards —
# and it is what the model's Python-side defaults already say.
_INT_COLUMNS = (
    'def_tackles_solo',
    'def_tackles_with_assist',
    'def_tackle_assists',
    'def_tackles_for_loss',
    'def_qb_hits',
    'def_interceptions',
    'def_pass_defended',
    'def_fumbles_forced',
    'def_tds',
    'fg_made',
    'fg_att',
    'fg_long',
)


def upgrade():
    for name in _INT_COLUMNS:
        op.add_column(
            'playerseasonstat',
            sa.Column(name, sa.Integer(), nullable=False, server_default=sa.text('0')),
        )
    op.add_column(
        'playerseasonstat',
        sa.Column('def_sacks', sa.Float(), nullable=False, server_default=sa.text('0')),
    )


def downgrade():
    op.drop_column('playerseasonstat', 'def_sacks')
    for name in reversed(_INT_COLUMNS):
        op.drop_column('playerseasonstat', name)
