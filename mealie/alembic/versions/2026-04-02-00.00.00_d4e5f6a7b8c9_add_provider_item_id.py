"""add provider_item_id to shopping list items

Revision ID: d4e5f6a7b8c9
Revises: b1c2d3e4f5a6
Create Date: 2026-04-02 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d4e5f6a7b8c9"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade():
    with op.batch_alter_table("shopping_list_items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("provider_item_id", sa.String(), nullable=True))

    # Migrate existing provider_uid from extras to the new column
    op.execute(
        """
        UPDATE shopping_list_items
        SET provider_item_id = (
            SELECT e.value FROM shopping_list_item_extras e
            WHERE e.shopping_list_item_id = shopping_list_items.id
            AND e.key_name = 'provider_uid'
        )
        WHERE EXISTS (
            SELECT 1 FROM shopping_list_item_extras e
            WHERE e.shopping_list_item_id = shopping_list_items.id
            AND e.key_name = 'provider_uid'
        )
        """
    )


def downgrade():
    with op.batch_alter_table("shopping_list_items", schema=None) as batch_op:
        batch_op.drop_column("provider_item_id")
