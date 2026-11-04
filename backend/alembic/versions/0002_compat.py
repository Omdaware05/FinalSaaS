"""Compatibility layer schema: memberships, tenant/agent/contact/campaign
extras, questionnaires, invoices, tenant configs, model config entries.

Revision ID: 0002_compat
Revises: 0001_initial
Create Date: 2026-11-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_compat"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- tenants: profile columns -------------------------------------
    with op.batch_alter_table("tenants") as batch:
        batch.add_column(sa.Column("industry", sa.String(120), nullable=True))
        batch.add_column(sa.Column("email", sa.String(320), nullable=True))
        batch.add_column(sa.Column("phone", sa.String(40), nullable=True))
        batch.add_column(sa.Column("website", sa.String(300), nullable=True))
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))

    # --- memberships ---------------------------------------------------
    op.create_table(
        "user_businesses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="member"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "tenant_id", name="uq_user_business_pair"),
    )
    op.create_index("ix_user_businesses_user_id", "user_businesses", ["user_id"])
    op.create_index("ix_user_businesses_tenant_id", "user_businesses", ["tenant_id"])

    # --- agents: old-UI columns ---------------------------------------
    with op.batch_alter_table("agents") as batch:
        batch.add_column(sa.Column("voice_name", sa.String(100), nullable=True))
        batch.add_column(sa.Column("voice_gender", sa.String(20), nullable=True))
        batch.add_column(sa.Column("tts_provider", sa.String(40), nullable=False, server_default="sarvam"))
        batch.add_column(sa.Column("language_mode", sa.String(40), nullable=False, server_default="auto_match"))
        batch.add_column(sa.Column("primary_language", sa.String(20), nullable=False, server_default="hi"))
        batch.add_column(sa.Column("default_language", sa.String(60), nullable=False, server_default="Hindi"))
        batch.add_column(sa.Column("supported_languages", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("speaking_speed", sa.Float(), nullable=False, server_default="1.0"))
        batch.add_column(sa.Column("telephony_provider", sa.String(40), nullable=False, server_default="vobiz"))
        batch.add_column(sa.Column("telephony_from_number", sa.String(32), nullable=True))
        batch.add_column(sa.Column("questionnaire_id", sa.String(36), nullable=True))

    # --- contacts ------------------------------------------------------
    with op.batch_alter_table("contacts") as batch:
        batch.add_column(sa.Column("agent_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("custom_fields", sa.JSON(), nullable=True))
    op.create_index("ix_contacts_agent_id", "contacts", ["agent_id"])

    # --- campaigns -----------------------------------------------------
    with op.batch_alter_table("campaigns") as batch:
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("questionnaire_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("phone_numbers", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("concurrency", sa.Integer(), nullable=False, server_default="5"))
        batch.add_column(sa.Column("provider", sa.String(40), nullable=False, server_default="vobiz"))
        batch.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))

    # --- questionnaires -------------------------------------------------
    op.create_table(
        "questionnaires",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("questions", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("version_history", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_questionnaires_tenant_id", "questionnaires", ["tenant_id"])

    # --- invoices --------------------------------------------------------
    op.create_table(
        "invoices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("customer_name", sa.String(200), nullable=True),
        sa.Column("customer_email", sa.String(320), nullable=True),
        sa.Column("customer_phone", sa.String(40), nullable=True),
        sa.Column("business_name", sa.String(200), nullable=True),
        sa.Column("items", sa.JSON(), nullable=True),
        sa.Column("tax_rate", sa.Float(), nullable=False, server_default="18"),
        sa.Column("currency", sa.String(8), nullable=False, server_default="INR"),
        sa.Column("subtotal", sa.Float(), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("issue_date", sa.DateTime(), nullable=True),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "number", name="uq_invoice_number_per_tenant"),
    )
    op.create_index("ix_invoices_tenant_id", "invoices", ["tenant_id"])

    # --- tenant configs ---------------------------------------------------
    op.create_table(
        "tenant_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("key", sa.String(60), nullable=False),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "key", name="uq_tenant_config_key"),
    )
    op.create_index("ix_tenant_configs_tenant_id", "tenant_configs", ["tenant_id"])

    # --- model config entries ---------------------------------------------
    op.create_table(
        "model_config_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("model_type", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("provider", sa.String(40), nullable=False, server_default="sarvam"),
        sa.Column("model_id", sa.String(200), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_model_config_entries_tenant_id", "model_config_entries", ["tenant_id"])
    op.create_index("ix_model_config_entries_model_type", "model_config_entries", ["model_type"])


def downgrade() -> None:
    op.drop_table("model_config_entries")
    op.drop_table("tenant_configs")
    op.drop_table("invoices")
    op.drop_table("questionnaires")
    with op.batch_alter_table("campaigns") as batch:
        batch.drop_column("updated_at")
        batch.drop_column("provider")
        batch.drop_column("concurrency")
        batch.drop_column("phone_numbers")
        batch.drop_column("questionnaire_id")
        batch.drop_column("description")
    op.drop_index("ix_contacts_agent_id", table_name="contacts")
    with op.batch_alter_table("contacts") as batch:
        batch.drop_column("custom_fields")
        batch.drop_column("agent_id")
    with op.batch_alter_table("agents") as batch:
        batch.drop_column("questionnaire_id")
        batch.drop_column("telephony_from_number")
        batch.drop_column("telephony_provider")
        batch.drop_column("speaking_speed")
        batch.drop_column("supported_languages")
        batch.drop_column("default_language")
        batch.drop_column("primary_language")
        batch.drop_column("language_mode")
        batch.drop_column("tts_provider")
        batch.drop_column("voice_gender")
        batch.drop_column("voice_name")
    op.drop_table("user_businesses")
    with op.batch_alter_table("tenants") as batch:
        batch.drop_column("updated_at")
        batch.drop_column("is_active")
        batch.drop_column("description")
        batch.drop_column("website")
        batch.drop_column("phone")
        batch.drop_column("email")
        batch.drop_column("industry")
