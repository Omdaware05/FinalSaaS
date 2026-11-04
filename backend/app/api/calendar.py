import calendar as _cal
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_db
from app.errors import DomainError
from app.models import Call, FollowUp
from app.serializers import STATE_MAP, followup_out

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1)
    last_day = _cal.monthrange(year, month)[1]
    end = datetime(year, month, last_day) + timedelta(days=1)
    return start, end


async def _day_data(db: AsyncSession, tenant_id: str, day: date) -> dict:
    start = datetime.combine(day, time.min)
    end = start + timedelta(days=1)
    calls = (
        await db.execute(
            select(Call).where(
                Call.tenant_id == tenant_id,
                Call.created_at >= start, Call.created_at < end,
            ).order_by(Call.created_at)
        )
    ).scalars().all()
    leads = [c for c in calls if c.disposition]
    followups = (
        await db.execute(
            select(FollowUp).where(
                FollowUp.tenant_id == tenant_id,
                FollowUp.scheduled_at >= start, FollowUp.scheduled_at < end,
            ).order_by(FollowUp.scheduled_at)
        )
    ).scalars().all()
    return {
        "date": day.isoformat(),
        "calls": [
            {
                "call_id": c.id, "id": c.id, "phone_number": c.phone, "phone": c.phone,
                "agent_id": c.agent_id,
                "state": STATE_MAP.get(c.status, c.status.upper()),
                "status": c.status,
                "duration": c.duration_seconds or 0,
                "duration_seconds": c.duration_seconds or 0,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in calls
        ],
        "leads": [
            {
                "lead_id": c.id, "id": c.id, "name": None, "phone_number": c.phone,
                "phone": c.phone, "status": c.disposition, "disposition": c.disposition,
                "score": c.lead_score or 0, "lead_score": c.lead_score,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in leads
        ],
        "followups": [followup_out(f) for f in followups],
    }


@router.get("/day")
async def calendar_day(date_str: str = Query(..., alias="date"),
                       tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    try:
        day = date.fromisoformat(date_str)
    except ValueError:
        raise DomainError("INVALID_DATE", "date must be YYYY-MM-DD.", 400)
    return await _day_data(db, tenant_id, day)


@router.get("/summary")
async def calendar_summary(year: int = Query(...), month: int = Query(..., ge=1, le=12),
                           tenant_id: str = Depends(get_active_tenant),
                           db: AsyncSession = Depends(get_db)):
    start, end = _month_bounds(year, month)
    calls = (
        await db.execute(
            select(Call).where(
                Call.tenant_id == tenant_id,
                Call.created_at >= start, Call.created_at < end,
            )
        )
    ).scalars().all()
    followups = (
        await db.execute(
            select(FollowUp).where(
                FollowUp.tenant_id == tenant_id,
                FollowUp.scheduled_at >= start, FollowUp.scheduled_at < end,
            )
        )
    ).scalars().all()
    days: dict[str, dict] = {}

    def _bucket(key: str) -> dict:
        return days.setdefault(key, {"calls": 0, "leads": 0, "followups": 0})

    for c in calls:
        bucket = _bucket(c.created_at.strftime("%Y-%m-%d"))
        bucket["calls"] += 1
        if c.disposition:
            bucket["leads"] += 1
    for f in followups:
        _bucket(f.scheduled_at.strftime("%Y-%m-%d"))["followups"] += 1
    return {"year": year, "month": month, "days": days}
