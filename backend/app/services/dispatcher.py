"""Background dispatcher: dials queued calls and due follow-ups.

Design notes (the old codebase got all of these wrong):
- Queued calls are claimed with a conditional UPDATE, so two dispatchers
  (or a restart overlap) can never dial the same row twice.
- Dialling respects the calling-hours gate and per-agent concurrency.
- Follow-ups re-check the DNC gate at dial time, not just at creation.
- Stale initiating/ringing calls are swept to failed instead of hanging.
"""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.models import Call, FollowUp, utcnow
from app.services import call_service, gates

logger = logging.getLogger(__name__)

POLL_SECONDS = 5
STALE_AFTER = timedelta(minutes=10)
MAX_FOLLOWUP_ATTEMPTS = 3
_FOLLOWUP_DELAYS = {  # minutes
    "busy": 30,
    "no_answer": 60,
    "failed": 45,
    "callback_requested": 120,
}


async def schedule_followup(db: AsyncSession, call: Call, reason: str) -> FollowUp | None:
    """Create a follow-up for a finished call, clamped into calling hours."""
    existing = (
        await db.execute(
            select(FollowUp).where(FollowUp.call_id == call.id, FollowUp.status == "pending")
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    delay = _FOLLOWUP_DELAYS.get(reason, 60)
    when = gates.clamp_to_calling_hours(utcnow() + timedelta(minutes=delay))
    followup = FollowUp(
        tenant_id=call.tenant_id,
        call_id=call.id,
        contact_id=call.contact_id,
        phone=call.phone,
        agent_id=call.agent_id,
        scheduled_at=when,
        notes=f"Auto follow-up: {reason}",
    )
    db.add(followup)
    await db.commit()
    await db.refresh(followup)
    return followup


async def claim_queued_call(db: AsyncSession, call_id: str) -> bool:
    """Atomically move one queued call to initiating. True iff we won it."""
    result = await db.execute(
        update(Call)
        .where(Call.id == call_id, Call.status == "queued")
        .values(status="initiating")
    )
    await db.commit()
    return (result.rowcount or 0) == 1


async def _dial_queued(db: AsyncSession) -> None:
    queued = (
        await db.execute(
            select(Call).where(Call.status == "queued").order_by(Call.created_at).limit(50)
        )
    ).scalars().all()
    for call in queued:
        from app.models import Agent

        agent = await db.get(Agent, call.agent_id)
        if agent is None or not agent.enabled:
            call.status = "cancelled"
            call.failure_reason = "Agent missing or disabled."
            await db.commit()
            continue
        active = await call_service._active_count(db, call.agent_id)
        if active >= (agent.concurrency or 5):
            continue
        if not await claim_queued_call(db, call.id):
            continue
        await db.refresh(call)
        await call_service.dial_existing_call(db, call)


async def _housekeeping(db: AsyncSession, now) -> None:
    cutoff = now - STALE_AFTER
    stale = (
        await db.execute(
            select(Call).where(
                Call.status.in_(("initiating", "ringing")), Call.created_at < cutoff
            )
        )
    ).scalars().all()
    for call in stale:
        call.status = "failed"
        call.termination_reason = "expired_unanswered"
        call.failure_reason = "Call never progressed within 10 minutes."
        call.ended_at = now
    if stale:
        await db.commit()
        logger.info("Dispatcher swept %d stale calls", len(stale))

    due = (
        await db.execute(
            select(FollowUp)
            .where(
                FollowUp.status == "pending",
                FollowUp.scheduled_at <= now,
                FollowUp.attempts < MAX_FOLLOWUP_ATTEMPTS,
            )
            .limit(50)
        )
    ).scalars().all()
    for followup in due:
        claimed = await db.execute(
            update(FollowUp)
            .where(FollowUp.id == followup.id, FollowUp.status == "pending")
            .values(status="processing")
        )
        await db.commit()
        if (claimed.rowcount or 0) != 1:
            continue
        await db.refresh(followup)

        blocked = await gates.is_blocked(db, followup.tenant_id, followup.phone)
        if blocked:
            followup.status = "cancelled"
            followup.notes = (followup.notes + f" Cancelled at dial time: {blocked}.").strip()
            await db.commit()
            continue

        call = Call(
            tenant_id=followup.tenant_id,
            agent_id=followup.agent_id,
            contact_id=followup.contact_id,
            phone=followup.phone,
            status="initiating",
            is_followup=True,
            parent_call_id=followup.call_id,
        )
        db.add(call)
        await db.commit()
        await db.refresh(call)
        ok, _code, message = await call_service.dial_existing_call(db, call)
        if ok:
            followup.status = "done"
        else:
            followup.attempts += 1
            if followup.attempts >= MAX_FOLLOWUP_ATTEMPTS:
                followup.status = "cancelled"
                followup.notes = (followup.notes + " Abandoned after 3 failed attempts.").strip()
            else:
                followup.status = "pending"
                followup.scheduled_at = gates.clamp_to_calling_hours(now + timedelta(minutes=30))
                followup.notes = (followup.notes + f" Attempt failed: {message}").strip()
        await db.commit()


async def run_dispatcher_forever() -> None:
    logger.info("Follow-up/batch dispatcher started")
    tick = 0
    while True:
        try:
            now = utcnow()
            async with async_session() as db:
                if await gates.within_calling_hours():
                    await _dial_queued(db)
            if tick % 12 == 0:  # housekeeping roughly every 60s
                async with async_session() as db:
                    await _housekeeping(db, now)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Dispatcher tick failed")
        tick += 1
        await asyncio.sleep(POLL_SECONDS)
