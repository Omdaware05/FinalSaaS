import io
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, user_tenant_ids
from app.errors import DomainError
from app.models import Agent, Call, Tenant, User, utcnow

router = APIRouter(prefix="/reports", tags=["reports"])


async def _business_report(db: AsyncSession, tenant: Tenant, period_days: int) -> dict:
    since = utcnow() - timedelta(days=period_days)
    calls = (
        await db.execute(
            select(Call).where(Call.tenant_id == tenant.id, Call.created_at >= since)
        )
    ).scalars().all()
    total = len(calls)
    completed = sum(1 for c in calls if c.status == "completed")
    durations = [c.duration_seconds or 0 for c in calls if c.duration_seconds]
    leads = [c for c in calls if c.disposition]
    interested = sum(1 for c in leads if c.disposition == "interested")
    not_interested = sum(1 for c in leads if c.disposition == "not_interested")
    callbacks = sum(1 for c in leads if c.disposition == "callback_requested")
    agents = (
        await db.execute(select(Agent).where(Agent.tenant_id == tenant.id))
    ).scalars().all()
    agent_names = {a.id: a.name for a in agents}
    performance = []
    for agent in agents:
        agent_calls = [c for c in calls if c.agent_id == agent.id]
        agent_leads = [c for c in agent_calls if c.disposition == "interested"]
        performance.append({
            "agent_id": agent.id,
            "agent_name": agent.name,
            "total_calls": len(agent_calls),
            "completed_calls": sum(1 for c in agent_calls if c.status == "completed"),
            "total_leads": len(agent_leads),
            "qualified_leads": len(agent_leads),
            "conversion_rate": round(len(agent_leads) / len(agent_calls) * 100, 1) if agent_calls else 0.0,
        })
    return {
        "report_id": f"report-{tenant.id}-{period_days}d",
        "business_id": tenant.id,
        "business_name": tenant.name,
        "period_days": period_days,
        "generated_at": utcnow().isoformat(),
        "summary": {
            "total_calls": total,
            "completed_calls": completed,
            "answer_rate": round(completed / total, 3) if total else 0.0,
            "average_duration_seconds": round(sum(durations) / len(durations), 1) if durations else 0.0,
            "total_leads": len(leads),
            "qualified_leads": interested,
            "hot_leads": interested,
            "converted_leads": interested,
            "qualification_rate": round(interested / len(leads), 3) if leads else 0.0,
            "conversion_rate": round(interested / total, 3) if total else 0.0,
        },
        "lead_status_distribution": {
            "interested": interested,
            "not_interested": not_interested,
            "callback_requested": callbacks,
            "new": callbacks,
            "qualified": interested,
            "closed": 0,
        },
        "agent_performance": performance,
        "agent_names": agent_names,
    }


@router.get("/agency/overview")
async def agency_overview(period_days: int = Query(30, ge=1, le=365),
                          user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    ids = await user_tenant_ids(db, user)
    tenants = (
        await db.execute(select(Tenant).where(Tenant.id.in_(ids)))
    ).scalars().all()
    reports = [await _business_report(db, t, period_days) for t in tenants]
    total_calls = sum(r["summary"]["total_calls"] for r in reports)
    total_leads = sum(r["summary"]["total_leads"] for r in reports)
    qualified = sum(r["summary"]["qualified_leads"] for r in reports)
    return {
        "period_days": period_days,
        "generated_at": utcnow().isoformat(),
        "businesses": reports,
        "totals": {
            "businesses": len(reports),
            "total_calls": total_calls,
            "total_leads": total_leads,
            "qualified_leads": qualified,
            "conversion_rate": round(qualified / total_leads, 3) if total_leads else 0.0,
        },
        "summary": {
            "total_calls": total_calls,
            "total_leads": total_leads,
            "qualified_leads": qualified,
        },
    }


@router.get("/business/{business_id}")
async def business_report(business_id: str, period_days: int = Query(30, ge=1, le=365),
                          user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    tenant = await db.get(Tenant, business_id)
    if tenant is None or business_id not in await user_tenant_ids(db, user):
        raise DomainError("BUSINESS_NOT_FOUND", "Business not found.", 404)
    return await _business_report(db, tenant, period_days)


@router.get("/business/{business_id}/export")
async def business_report_export(business_id: str, period_days: int = Query(30, ge=1, le=365),
                                 user: User = Depends(get_current_user),
                                 db: AsyncSession = Depends(get_db)):
    from openpyxl import Workbook

    tenant = await db.get(Tenant, business_id)
    if tenant is None or business_id not in await user_tenant_ids(db, user):
        raise DomainError("BUSINESS_NOT_FOUND", "Business not found.", 404)
    report = await _business_report(db, tenant, period_days)
    since = utcnow() - timedelta(days=period_days)
    calls = (
        await db.execute(
            select(Call).where(Call.tenant_id == tenant.id, Call.created_at >= since)
            .order_by(Call.created_at.desc())
        )
    ).scalars().all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws.append(["Business", tenant.name])
    ws.append(["Period (days)", period_days])
    for key, value in report["summary"].items():
        ws.append([key, value])
    ws2 = wb.create_sheet("Calls")
    ws2.append(["Call ID", "Phone", "Status", "Disposition", "Duration (s)", "Lead Score", "Created At"])
    for c in calls:
        ws2.append([c.id, c.phone, c.status, c.disposition or "", c.duration_seconds or 0,
                    c.lead_score or "", c.created_at.isoformat() if c.created_at else ""])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=report-{tenant.slug}.xlsx"},
    )
