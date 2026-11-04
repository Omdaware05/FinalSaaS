"""Per-tenant configuration overrides + credential resolution.

Resolution order everywhere: TenantConfig override (set from the old
UI's settings screens) -> environment settings. Overrides are stored in
the tenant_configs table; API layers must only ever expose them masked.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import TenantConfig

logger = logging.getLogger(__name__)

KEYS = ("vobiz", "twilio", "sarvam", "transcript_api", "voice_mode")


async def get_override(db: AsyncSession, tenant_id: str, key: str) -> dict | None:
    row = (
        await db.execute(
            select(TenantConfig).where(TenantConfig.tenant_id == tenant_id, TenantConfig.key == key)
        )
    ).scalar_one_or_none()
    if row is None or not isinstance(row.value, dict) or not row.value:
        return None
    return row.value


async def set_override(db: AsyncSession, tenant_id: str, key: str, value: dict) -> TenantConfig:
    """Merge `value` into the stored override (empty-string fields clear)."""
    row = (
        await db.execute(
            select(TenantConfig).where(TenantConfig.tenant_id == tenant_id, TenantConfig.key == key)
        )
    ).scalar_one_or_none()
    merged = dict(row.value or {}) if row else {}
    for k, v in value.items():
        if v is None:
            continue
        if isinstance(v, str) and v == "":
            merged.pop(k, None)
        else:
            merged[k] = v
    if row is None:
        row = TenantConfig(tenant_id=tenant_id, key=key, value=merged)
        db.add(row)
    else:
        row.value = merged
    await db.commit()
    await db.refresh(row)
    return row


def mask_secret(value: str | None) -> str:
    """'sk-...abcd' style mask: only the last 4 characters survive."""
    v = (value or "").strip()
    if not v:
        return ""
    if len(v) <= 4:
        return "****"
    return f"****{v[-4:]}"


async def resolve_vobiz(db: AsyncSession, tenant_id: str) -> dict:
    """{auth_id, auth_token, from_number, configured, source}"""
    override = await get_override(db, tenant_id, "vobiz") or {}
    auth_id = (override.get("auth_id") or settings.VOBIZ_AUTH_ID or "").strip()
    auth_token = (override.get("auth_token") or settings.VOBIZ_AUTH_TOKEN or "").strip()
    from_number = (override.get("from_number") or override.get("phone_number")
                   or settings.VOBIZ_FROM_NUMBER or "").strip()
    return {
        "auth_id": auth_id,
        "auth_token": auth_token,
        "from_number": from_number,
        "configured": bool(auth_id and auth_token and from_number),
        "source": "tenant" if override.get("auth_id") else "environment",
    }


async def resolve_twilio(db: AsyncSession, tenant_id: str) -> dict:
    override = await get_override(db, tenant_id, "twilio") or {}
    return {
        "account_sid": (override.get("account_sid") or "").strip(),
        "auth_token": (override.get("auth_token") or "").strip(),
        "phone_number": (override.get("phone_number") or override.get("from_number") or "").strip(),
        "configured": bool(override.get("account_sid") and override.get("auth_token")),
        "source": "tenant" if override else "none",
    }


async def resolve_sarvam(db: AsyncSession, tenant_id: str) -> dict:
    override = await get_override(db, tenant_id, "sarvam") or {}
    api_key = (override.get("api_key") or settings.SARVAM_API_KEY or "").strip()
    return {
        "api_key": api_key,
        "default_voice": (override.get("default_voice") or "shubh").strip(),
        "configured": bool(api_key),
        "source": "tenant" if override.get("api_key") else "environment",
    }


async def resolve_voice_mode(db: AsyncSession, tenant_id: str) -> str:
    override = await get_override(db, tenant_id, "voice_mode") or {}
    mode = (override.get("mode") or settings.VOICE_PROVIDER or "sarvam").strip().lower()
    return mode if mode in ("sarvam", "local", "api") else "sarvam"


async def resolve_transcript_api(db: AsyncSession, tenant_id: str) -> dict:
    override = await get_override(db, tenant_id, "transcript_api") or {}
    api_key = (override.get("api_key") or "").strip()
    return {
        "provider": override.get("provider") or "built-in",
        "api_key": api_key,
        "model": override.get("model") or "offline-rule-analyzer",
        "configured": True,  # the built-in analyzer always works
        "external_configured": bool(api_key),
    }
