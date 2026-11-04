from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.errors import DomainError
from app.models import Call, TranscriptSegment, User
from app.services import call_service, storage

router = APIRouter(prefix="/calls", tags=["calls"])


class InitiateIn(BaseModel):
    agent_id: str
    phone: str
    contact_id: str | None = None


class BatchIn(BaseModel):
    agent_id: str
    phones: list[str]


def _out(c: Call) -> dict:
    return {
        "id": c.id, "agent_id": c.agent_id, "contact_id": c.contact_id,
        "campaign_id": c.campaign_id, "phone": c.phone, "direction": c.direction,
        "status": c.status, "disposition": c.disposition,
        "provider_call_uuid": c.provider_call_uuid,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "answered_at": c.answered_at.isoformat() if c.answered_at else None,
        "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        "duration_seconds": c.duration_seconds,
        "termination_reason": c.termination_reason, "failure_reason": c.failure_reason,
        "recording_status": c.recording_status,
        "lead_score": c.lead_score, "lead_summary": c.lead_summary,
        "is_followup": c.is_followup, "parent_call_id": c.parent_call_id,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


async def _get(db: AsyncSession, user: User, call_id: str) -> Call:
    call = (
        await db.execute(
            select(Call).where(Call.id == call_id, Call.tenant_id == user.tenant_id)
        )
    ).scalar_one_or_none()
    if call is None:
        raise DomainError("CALL_NOT_FOUND", "Call not found.", 404)
    return call


@router.post("/initiate", status_code=201)
async def initiate(body: InitiateIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    call = await call_service.initiate_call(db, user, body.agent_id, body.phone, body.contact_id)
    return _out(call)


@router.post("/batch", status_code=201)
async def batch(body: BatchIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    call_service.telephony_preflight()  # fail fast before creating any rows
    created, errors = await call_service.enqueue_batch(
        db, user, body.agent_id, [{"phone": p} for p in body.phones]
    )
    return {"queued": len(created), "calls": [_out(c) for c in created], "errors": errors}


@router.get("")
async def list_calls(
    status: str | None = None,
    agent_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Call).where(Call.tenant_id == user.tenant_id)
    if status:
        query = query.where(Call.status == status)
    if agent_id:
        query = query.where(Call.agent_id == agent_id)
    rows = (
        await db.execute(query.order_by(Call.created_at.desc()).limit(limit).offset(offset))
    ).scalars().all()
    return [_out(c) for c in rows]


@router.get("/{call_id}")
async def get_call(call_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    call = await _get(db, user, call_id)
    segments = (
        await db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.call_id == call.id)
            .order_by(TranscriptSegment.offset_seconds, TranscriptSegment.created_at)
        )
    ).scalars().all()
    data = _out(call)
    data["transcript"] = [
        {"speaker": s.speaker, "text": s.text, "offset_seconds": s.offset_seconds}
        for s in segments
    ]
    return data


@router.get("/{call_id}/recording")
async def get_recording(call_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    call = await _get(db, user, call_id)
    if call.recording_status not in ("ready", "synthesized") or not call.recording_path:
        raise DomainError("RECORDING_NOT_FOUND", "No recording available for this call.", 404)
    path = storage.recording_abspath(call.recording_path)
    if not path.exists():
        raise DomainError("RECORDING_NOT_FOUND", "Recording file is missing.", 404)
    return FileResponse(path, media_type="audio/wav", filename=f"call_{call.id}.wav")


@router.post("/{call_id}/hangup")
async def hangup(call_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    call = await call_service.hangup_call(db, user, call_id)
    return _out(call)
