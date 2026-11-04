import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_current_user, get_db, scoped_user
from app.errors import DomainError
from app.models import Agent, Call, Contact, TranscriptSegment, User
from app.serializers import STATE_MAP, STATUS_FROM_STATE, call_out, interest_out, transcript_doc
from app.services import analyzer, call_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["calls"])


class CallIn(BaseModel):
    agent_id: str
    phone_number: str = ""
    phone: str = ""
    contact_id: str | None = None


class BatchIn(BaseModel):
    agent_id: str
    items: list[dict]


async def _names(db: AsyncSession, calls: list[Call]) -> tuple[dict, dict]:
    agent_ids = {c.agent_id for c in calls}
    contact_ids = {c.contact_id for c in calls if c.contact_id}
    agents = {}
    if agent_ids:
        rows = (await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))).scalars().all()
        agents = {a.id: a.name for a in rows}
    contacts = {}
    if contact_ids:
        rows = (await db.execute(select(Contact).where(Contact.id.in_(contact_ids)))).scalars().all()
        contacts = {c.id: c.name for c in rows}
    return agents, contacts


async def _get_call(db: AsyncSession, tenant_id: str, call_id: str) -> Call:
    call = (
        await db.execute(
            select(Call).where(Call.id == call_id, Call.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if call is None:
        raise DomainError("CALL_NOT_FOUND", "Call not found.", 404)
    return call


async def _segments(db: AsyncSession, call_id: str) -> list[TranscriptSegment]:
    return (
        await db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.call_id == call_id)
            .order_by(TranscriptSegment.created_at)
        )
    ).scalars().all()


def _out(c: Call, agent_name: str | None = None, contact_name: str | None = None) -> dict:
    return call_out(c, agent_name=agent_name, contact_name=contact_name)


@router.post("/calls/initiate", status_code=201)
async def initiate(body: CallIn, user: User = Depends(get_current_user),
                   tenant_id: str = Depends(get_active_tenant),
                   db: AsyncSession = Depends(get_db)):
    call = await call_service.initiate_call(
        db, scoped_user(user, tenant_id), body.agent_id,
        body.phone_number or body.phone, body.contact_id,
    )
    return _out(call)


@router.post("/calls/batch")
async def batch(body: BatchIn, user: User = Depends(get_current_user),
                tenant_id: str = Depends(get_active_tenant),
                db: AsyncSession = Depends(get_db)):
    suser = scoped_user(user, tenant_id)
    agent = await call_service._get_agent(db, suser, body.agent_id)
    await call_service.telephony_preflight_for(db, agent.tenant_id)
    created, errors = await call_service.enqueue_batch(db, suser, body.agent_id, body.items)
    return {"queued": len(created), "calls": [_out(c) for c in created], "errors": errors}


@router.get("/calls")
async def list_calls(
    status: str | None = None,
    state: str | None = None,
    agent_id: str | None = None,
    campaign_id: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    tenant_id: str = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Call).where(Call.tenant_id == tenant_id)
    effective_status = status
    if not effective_status and state:
        effective_status = STATUS_FROM_STATE.get(state.lower())
        if effective_status is None and state.lower() in (
            "queued", "initiating", "ringing", "in_progress", "completed",
            "failed", "busy", "no_answer", "cancelled",
        ):
            effective_status = state.lower()
    if effective_status:
        stmt = stmt.where(Call.status == effective_status)
    if agent_id:
        stmt = stmt.where(Call.agent_id == agent_id)
    if campaign_id:
        stmt = stmt.where(Call.campaign_id == campaign_id)
    if search:
        stmt = stmt.where(or_(Call.phone.ilike(f"%{search}%"), Call.disposition.ilike(f"%{search}%")))
    if date_from:
        try:
            stmt = stmt.where(Call.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            stmt = stmt.where(Call.created_at <= datetime.fromisoformat(date_to))
        except ValueError:
            pass
    rows = (
        await db.execute(stmt.order_by(Call.created_at.desc()).limit(limit).offset(skip))
    ).scalars().all()
    agents, contacts = await _names(db, rows)
    return [_out(c, agents.get(c.agent_id), contacts.get(c.contact_id or "")) for c in rows]


@router.get("/calls/{call_id}")
async def get_call(call_id: str, tenant_id: str = Depends(get_active_tenant),
                   db: AsyncSession = Depends(get_db)):
    call = await _get_call(db, tenant_id, call_id)
    agents, contacts = await _names(db, [call])
    segments = await _segments(db, call_id)
    out = _out(call, agents.get(call.agent_id), contacts.get(call.contact_id or ""))
    out["transcript"] = transcript_doc(call, segments) if segments else None
    out["transcript_segments"] = [
        {"speaker": s.speaker, "text": s.text, "offset_seconds": s.offset_seconds}
        for s in segments
    ]
    return out


@router.get("/calls/{call_id}/transcript")
async def get_transcript(call_id: str, tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    call = await _get_call(db, tenant_id, call_id)
    segments = await _segments(db, call_id)
    return transcript_doc(call, segments)


@router.get("/calls/{call_id}/interest")
async def get_interest(call_id: str, tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    call = await _get_call(db, tenant_id, call_id)
    return interest_out(call)


class InterestIn(BaseModel):
    status: str | None = None
    disposition: str | None = None
    interest_status: str | None = None
    notes: str | None = None


@router.post("/calls/{call_id}/interest")
async def set_interest(call_id: str, body: InterestIn,
                       tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    call = await _get_call(db, tenant_id, call_id)
    value = (body.disposition or body.status or body.interest_status or "").strip().lower()
    mapping = {
        "interested": ("interested", 85),
        "not_interested": ("not_interested", 10),
        "uncertain": ("unknown", 50),
        "unknown": ("unknown", 50),
        "callback_requested": ("callback_requested", 60),
        "callback": ("callback_requested", 60),
    }
    if value not in mapping:
        raise DomainError(
            "INVALID_STATUS",
            "status must be one of: interested, not_interested, uncertain, callback_requested.",
            400,
        )
    disposition, score = mapping[value]
    call.disposition = disposition
    call.lead_score = score
    if body.notes:
        call.lead_summary = body.notes
    await db.commit()
    await db.refresh(call)
    return interest_out(call)


@router.post("/calls/{call_id}/analyze-interest")
async def analyze_interest(call_id: str, tenant_id: str = Depends(get_active_tenant),
                           db: AsyncSession = Depends(get_db)):
    call = await _get_call(db, tenant_id, call_id)
    segments = await _segments(db, call_id)
    text = "\n".join(
        f"{'Customer' if s.speaker == 'customer' else 'Agent'}: {s.text}" for s in segments
    )
    result = analyzer.analyze(text)
    call.disposition = result["disposition"]
    call.lead_score = result["lead_score"]
    call.lead_summary = result["summary"]
    await db.commit()
    await db.refresh(call)
    return interest_out(call, analysis=result)


@router.get("/calls/{call_id}/recording")
async def recording(call_id: str, tenant_id: str = Depends(get_active_tenant),
                    db: AsyncSession = Depends(get_db)):
    call = await _get_call(db, tenant_id, call_id)
    if call.recording_status not in ("ready", "synthesized") or not call.recording_path:
        raise DomainError("RECORDING_NOT_FOUND", "No recording available for this call.", 404)
    from app.services.storage import recording_abspath

    path = recording_abspath(call.recording_path)
    if path is None:
        raise DomainError("RECORDING_NOT_FOUND", "Recording file is missing from storage.", 404)
    return FileResponse(path, media_type="audio/wav", filename=f"call-{call.id}.wav")


@router.post("/calls/{call_id}/hangup")
async def hangup(call_id: str, user: User = Depends(get_current_user),
                 tenant_id: str = Depends(get_active_tenant),
                 db: AsyncSession = Depends(get_db)):
    call = await call_service.hangup_call(db, scoped_user(user, tenant_id), call_id)
    return _out(call)


@router.get("/active-calls")
async def active_calls(tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Call).where(
                Call.tenant_id == tenant_id, Call.status.in_(call_service.ACTIVE_STATUSES)
            ).order_by(Call.created_at.desc())
        )
    ).scalars().all()
    return {
        "active_count": len(rows),
        "calls": [
            {
                "call_id": c.id, "id": c.id, "phone_number": c.phone, "phone": c.phone,
                "provider": "vobiz", "state": STATE_MAP.get(c.status, c.status.upper()),
                "status": c.status, "duration": c.duration_seconds or 0,
                "duration_seconds": c.duration_seconds or 0,
                "agent_id": c.agent_id,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in rows
        ],
    }


@router.get("/queue")
async def queue_status(tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    queued = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant_id, Call.status.in_(("queued", "initiating"))
            )
        )
    ).scalar_one()
    agent_rows = (
        await db.execute(
            select(Call.agent_id, func.count(Call.id))
            .where(Call.tenant_id == tenant_id, Call.status == "queued")
            .group_by(Call.agent_id)
        )
    ).all()
    from app.services.dispatcher import dispatcher_running

    return {
        "queued_count": queued,
        "is_running": dispatcher_running(),
        "stop_requested": False,
        "by_agent": {agent_id: count for agent_id, count in agent_rows},
    }
