from datetime import datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_db
from app.models import Agent, Call

router = APIRouter(tags=["stats"])


def _provider_bucket() -> dict:
    return {"total": 0, "completed": 0, "failed": 0, "interested": 0, "not_interested": 0}


@router.get("/stats")
async def stats(tenant_id: str = Depends(get_active_tenant),
                db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Call.status, func.count(Call.id))
            .where(Call.tenant_id == tenant_id)
            .group_by(Call.status)
        )
    ).all()
    counts = {s: n for s, n in rows}
    total = sum(counts.values())
    dispositions = (
        await db.execute(
            select(Call.disposition, func.count(Call.id))
            .where(Call.tenant_id == tenant_id, Call.disposition.is_not(None))
            .group_by(Call.disposition)
        )
    ).all()
    disp = {d: n for d, n in dispositions}
    avg_duration = (
        await db.execute(
            select(func.avg(Call.duration_seconds)).where(
                Call.tenant_id == tenant_id, Call.duration_seconds.is_not(None)
            )
        )
    ).scalar() or 0.0
    today_start = datetime.combine(datetime.now().date(), time.min)
    today = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant_id, Call.created_at >= today_start
            )
        )
    ).scalar_one()
    bucket = _provider_bucket()
    bucket.update({
        "total": total,
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
        "interested": disp.get("interested", 0),
        "not_interested": disp.get("not_interested", 0),
    })
    return {
        "total_calls": total,
        "queued": counts.get("queued", 0) + counts.get("initiating", 0),
        "active": sum(counts.get(s, 0) for s in ("initiating", "ringing", "in_progress")),
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
        "busy": counts.get("busy", 0),
        "no_answer": counts.get("no_answer", 0),
        "cancelled": counts.get("cancelled", 0),
        "interested": disp.get("interested", 0),
        "not_interested": disp.get("not_interested", 0),
        "callbacks": disp.get("callback_requested", 0),
        "callback_requested": disp.get("callback_requested", 0),
        "today_calls": today,
        "calls_today": today,
        "average_duration_seconds": round(float(avg_duration), 1),
        "status_counts": counts,
        "disposition_counts": disp,
        "vobiz": bucket,
        "plivo": dict(bucket),
        "mock": _provider_bucket(),
    }


@router.get("/stats/providers")
async def provider_breakdown(tenant_id: str = Depends(get_active_tenant),
                             db: AsyncSession = Depends(get_db)):
    calls = (
        await db.execute(select(Call).where(Call.tenant_id == tenant_id))
    ).scalars().all()
    agents = (
        await db.execute(select(Agent).where(Agent.tenant_id == tenant_id))
    ).scalars().all()
    agent_provider = {a.id: (a.telephony_provider or "vobiz") for a in agents}

    def _blank() -> dict:
        return {
            "total_calls": 0, "completed_calls": 0, "failed_calls": 0,
            "interested": 0, "not_interested": 0, "total_duration_seconds": 0,
        }

    telephony: dict[str, dict] = {}
    voice: dict[str, dict] = {}
    for c in calls:
        for group, key in ((telephony, agent_provider.get(c.agent_id, "vobiz")),
                           (voice, "sarvam")):
            b = group.setdefault(key, _blank())
            b["total_calls"] += 1
            if c.status == "completed":
                b["completed_calls"] += 1
            if c.status in ("failed", "busy", "no_answer"):
                b["failed_calls"] += 1
            if c.disposition == "interested":
                b["interested"] += 1
            if c.disposition == "not_interested":
                b["not_interested"] += 1
            b["total_duration_seconds"] += c.duration_seconds or 0
    return {
        "telephony_providers": telephony,
        "voice_providers": voice,
        "providers": {**telephony, **{f"voice:{k}": v for k, v in voice.items()}},
        "labels": {"telephony": ["vobiz"], "voice": ["sarvam", "local"]},
    }
