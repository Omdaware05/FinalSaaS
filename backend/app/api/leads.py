import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_current_user, get_db
from app.errors import DomainError
from app.models import Agent, Call, Contact, User
from app.serializers import lead_out

router = APIRouter(prefix="/leads", tags=["leads"])

LEAD_DISPOSITIONS = ("interested", "not_interested", "callback_requested", "unknown")
STATUS_TO_DISPOSITION = {
    "interested": "interested",
    "not_interested": "not_interested",
    "new": None,
    "qualified": None,
    "closed": None,
}


async def _lead_rows(db: AsyncSession, tenant_id: str, agent_id: str | None = None,
                     disposition: str | None = None) -> list[tuple[Call, str | None, Contact | None]]:
    stmt = (
        select(Call, Agent.name, Contact)
        .join(Agent, Agent.id == Call.agent_id)
        .outerjoin(Contact, Contact.id == Call.contact_id)
        .where(Call.tenant_id == tenant_id, Call.disposition.is_not(None))
        .order_by(Call.ended_at.desc().nulls_last(), Call.created_at.desc())
    )
    if disposition:
        stmt = stmt.where(Call.disposition == disposition)
    else:
        stmt = stmt.where(Call.disposition.in_(LEAD_DISPOSITIONS))
    if agent_id:
        stmt = stmt.where(Call.agent_id == agent_id)
    rows = (await db.execute(stmt)).all()
    return [(call, agent_name, contact) for call, agent_name, contact in rows]


def _out(call: Call, agent_name: str | None, contact: Contact | None) -> dict:
    return lead_out(
        call, agent_name=agent_name,
        contact_name=contact.name if contact else None,
        contact_email=contact.email if contact else None,
    )


@router.get("")
async def list_leads(agent_id: str | None = None, status: str | None = None,
                     limit: int = Query(500, ge=1, le=1000), skip: int = Query(0, ge=0),
                     tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    disposition = None
    if status:
        disposition = {"interested": "interested", "not_interested": "not_interested"}.get(status)
        if disposition is None:
            # 'new' maps to callback/unknown dispositions in the old vocabulary
            disposition = "callback_requested" if status == "new" else status
    rows = await _lead_rows(db, tenant_id, agent_id=agent_id, disposition=disposition)
    return [_out(c, a, ct) for c, a, ct in rows[skip:skip + limit]]


@router.get("/export.xlsx")
async def export_leads(status: str | None = None,
                       tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    from openpyxl import Workbook

    rows = await _lead_rows(db, tenant_id)
    if status:
        wanted = {"interested": "interested", "not_interested": "not_interested",
                  "new": "callback_requested"}.get(status, status)
        rows = [r for r in rows if r[0].disposition == wanted]
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"
    ws.append(["Phone", "Agent", "Disposition", "Lead Score", "Summary", "Ended At"])
    for call, agent_name, _contact in rows:
        ws.append([
            call.phone, agent_name, call.disposition, call.lead_score,
            call.lead_summary,
            call.ended_at.isoformat() if call.ended_at else "",
        ])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=leads.xlsx"},
    )


@router.get("/{lead_id}")
async def get_lead(lead_id: str, tenant_id: str = Depends(get_active_tenant),
                   db: AsyncSession = Depends(get_db)):
    rows = await _lead_rows(db, tenant_id)
    for call, agent_name, contact in rows:
        if call.id == lead_id:
            return _out(call, agent_name, contact)
    raise DomainError("LEAD_NOT_FOUND", "Lead not found.", 404)


class LeadPatch(BaseModel):
    status: str | None = None
    notes: str | None = None


@router.patch("/{lead_id}")
async def patch_lead(lead_id: str, body: LeadPatch,
                     tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    call = (
        await db.execute(
            select(Call).where(Call.id == lead_id, Call.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if call is None:
        raise DomainError("LEAD_NOT_FOUND", "Lead not found.", 404)
    if body.status:
        disposition = STATUS_TO_DISPOSITION.get(body.status)
        if disposition:
            call.disposition = disposition
        elif body.status in STATUS_TO_DISPOSITION:
            # qualified/closed/new have no Call disposition column value;
            # the stage is recorded in the summary so it is not lost.
            prefix = f"[{body.status}] "
            current = call.lead_summary or ""
            if not current.startswith("["):
                call.lead_summary = prefix + current
        else:
            raise DomainError("INVALID_STATUS", f"Unknown lead status {body.status!r}.", 400)
    if body.notes is not None:
        call.lead_summary = body.notes
    await db.commit()
    await db.refresh(call)
    agent = await db.get(Agent, call.agent_id)
    contact = await db.get(Contact, call.contact_id) if call.contact_id else None
    return _out(call, agent.name if agent else None, contact)
