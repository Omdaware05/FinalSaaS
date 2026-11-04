"""Pre-dial gates: DNC/consent suppression and calling-hours window.

These run on EVERY dial path (single, batch, campaign, follow-up) — the old
codebase only checked DNC on the single-call path, which let bulk dialling
bypass it entirely.
"""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Contact


async def is_blocked(db: AsyncSession, tenant_id: str, phone: str) -> str | None:
    """Return a block reason ('do_not_call' / 'consent_denied') or None."""
    contact = (
        await db.execute(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone == phone)
        )
    ).scalar_one_or_none()
    if contact is None:
        return None
    if contact.status == "do_not_call":
        return "do_not_call"
    if contact.consent_status == "denied":
        return "consent_denied"
    return None


def _business_tz() -> ZoneInfo:
    return ZoneInfo(settings.BUSINESS_TIMEZONE)


async def within_calling_hours(now: datetime | None = None) -> bool:
    """True when `now` (UTC; naive treated as UTC) is inside the calling window."""
    tz = _business_tz()
    if now is None:
        local = datetime.now(tz)
    else:
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        local = now.astimezone(tz)
    return settings.CALLING_HOURS_START <= local.hour < settings.CALLING_HOURS_END


def clamp_to_calling_hours(dt_utc_naive: datetime) -> datetime:
    """Move a UTC datetime into the next calling-hours window (returns naive UTC)."""
    tz = _business_tz()
    aware = dt_utc_naive.replace(tzinfo=timezone.utc)
    local = aware.astimezone(tz)
    start = time(settings.CALLING_HOURS_START, 0)
    if local.time() < start:
        local = local.replace(hour=settings.CALLING_HOURS_START, minute=0, second=0, microsecond=0)
    elif local.hour >= settings.CALLING_HOURS_END:
        local = (local + timedelta(days=1)).replace(
            hour=settings.CALLING_HOURS_START, minute=0, second=0, microsecond=0
        )
    return local.astimezone(timezone.utc).replace(tzinfo=None)
