from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_current_user, get_db, scoped_user
from app.errors import DomainError
from app.models import Call, FollowUp, User
from app.serializers import FOLLOWUP_STATUS_IN, followup_out
from app.services import call_service, dispatcher

router = APIRouter(prefix="/followups", tags=["followups"])


async def _get(db: AsyncSession, tenant_id: str, followup_id: str) -> FollowUp:
    followup = (
        await db.execute(
            select(FollowUp).where(FollowUp.id == followup_id, FollowUp.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if followup is None:
        raise DomainError("FOLLOWUP_NOT_FOUND", "Follow-up not found.", 404)
    return followup


@router.get("")
async def list_followups(
    status: str | None = None,
    agent_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 100,
    skip: int = 0,
    tenant_id: str = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(FollowUp).where(FollowUp.tenant_id == tenant_id)
    if status:
        internal = FOLLOWUP_STATUS_IN.get(status.lower())
        if internal:
            stmt = stmt.where(FollowUp.status == internal)
    if agent_id:
        stmt = stmt.where(FollowUp.agent_id == agent_id)
    if date_from:
        try:
            stmt = stmt.where(FollowUp.scheduled_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            stmt = stmt.where(FollowUp.scheduled_at <= datetime.fromisoformat(date_to))
        except ValueError:
            pass
    rows = (
        await db.execute(
            stmt.order_by(FollowUp.scheduled_at).limit(min(limit, 500)).offset(skip)
        )
    ).scalars().all()
    return [followup_out(f) for f in rows]


@router.get("/{followup_id}")
async def get_followup(followup_id: str, tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    return followup_out(await _get(db, tenant_id, followup_id))


class FollowupPatch(BaseModel):
    status: str | None = None
    scheduled_at: str | None = None
    notes: str | None = None


@router.patch("/{followup_id}")
async def patch_followup(followup_id: str, body: FollowupPatch,
                         tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    followup = await _get(db, tenant_id, followup_id)
    if body.status:
        internal = FOLLOWUP_STATUS_IN.get(body.status.lower())
        if internal is None:
            raise DomainError("INVALID_STATUS", f"Unknown follow-up status {body.status!r}.", 400)
        followup.status = internal
    if body.scheduled_at:
        try:
            followup.scheduled_at = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            raise DomainError("INVALID_DATE", "scheduled_at must be an ISO datetime.", 400)
    if body.notes is not None:
        followup.notes = body.notes
    await db.commit()
    await db.refresh(followup)
    return followup_out(followup)


@router.delete("/{followup_id}")
async def cancel_followup(followup_id: str, tenant_id: str = Depends(get_active_tenant),
                          db: AsyncSession = Depends(get_db)):
    followup = await _get(db, tenant_id, followup_id)
    followup.status = "cancelled"
    await db.commit()
    return {"deleted": True, "success": True, "followup_id": followup_id, "status": "cancelled"}


@router.post("/dispatch")
async def dispatch_now(db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)):
    dispatched = await dispatcher.dispatch_tick(db)
    return {
        "dispatched": dispatched,
        "placed_count": dispatched,
        "message": f"Dispatcher tick complete: {dispatched} call(s) dispatched.",
    }


@router.post("/{followup_id}/call")
async def call_now(followup_id: str, user: User = Depends(get_current_user),
                   tenant_id: str = Depends(get_active_tenant),
                   db: AsyncSession = Depends(get_db)):
    followup = await _get(db, tenant_id, followup_id)
    if followup.status in ("done", "cancelled"):
        raise DomainError("FOLLOWUP_CLOSED", f"Follow-up is already {followup.status}.", 409)
    followup.status = "processing"
    await db.commit()
    # initiate_call enforces the DNC/consent gate and telephony preflight;
    # a DomainError propagates and leaves the follow-up in 'processing'
    # only if the dial itself was attempted — reset to pending on failure.
    try:
        call = await call_service.initiate_call(
            db, scoped_user(user, tenant_id), followup.agent_id, followup.phone,
            contact_id=followup.contact_id,
        )
    except DomainError:
        followup.status = "pending"
        await db.commit()
        raise
    call.is_followup = True
    call.parent_call_id = followup.call_id
    followup.status = "done"
    await db.commit()
    return {
        "status": "initiated",
        "call_id": call.id,
        "followup_id": followup.id,
        "phone_number": followup.phone,
        "message": f"Call initiated to {followup.phone}",
    }
