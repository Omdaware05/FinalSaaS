"""Call initiation, batch enqueue and hangup.

Every dial path in the product funnels through here so the safety gates
(DNC/consent, telephony preflight, public URL, concurrency) cannot be
bypassed by one path the way the old codebase allowed.
"""
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.errors import DomainError
from app.models import Agent, Call, User, utcnow
from app.security import sign_call_token
from app.services import gates
from app.services.phone import normalize_phone

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("initiating", "ringing", "in_progress")


# ---------------------------------------------------------------- preflight
def telephony_preflight() -> None:
    """Raise a clear 422 when outbound calling cannot possibly work."""
    if not settings.telephony_configured:
        raise DomainError(
            "TELEPHONY_NOT_CONFIGURED",
            "VoBiz telephony is not configured. Set VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN "
            "and VOBIZ_FROM_NUMBER in backend/.env.",
            422,
        )
    if not settings.PUBLIC_BASE_URL.startswith("https://"):
        raise DomainError(
            "PUBLIC_URL_NOT_CONFIGURED",
            "PUBLIC_BASE_URL must be a public https:// URL so the carrier can reach "
            "the answer/stream webhooks. Set PUBLIC_BASE_URL in backend/.env (for local "
            "development, expose port 8001 with a tunnel such as ngrok or cloudflared).",
            422,
        )


def _webhook_url(kind: str, call_id: str) -> str:
    base = settings.PUBLIC_BASE_URL.rstrip("/")
    return f"{base}/api/v1/webhooks/vobiz/{kind}/{call_id}?t={sign_call_token(call_id)}"


async def _get_agent(db: AsyncSession, user: User, agent_id: str) -> Agent:
    agent = (
        await db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.tenant_id == user.tenant_id)
        )
    ).scalar_one_or_none()
    if agent is None:
        raise DomainError("AGENT_NOT_FOUND", "Agent not found.", 404)
    if not agent.enabled:
        raise DomainError("AGENT_DISABLED", "This agent is disabled.", 400)
    return agent


async def _active_count(db: AsyncSession, agent_id: str) -> int:
    return (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.agent_id == agent_id, Call.status.in_(ACTIVE_STATUSES)
            )
        )
    ).scalar_one()


def _map_carrier_error(message: str) -> DomainError:
    text = (message or "").lower()
    if "insufficient" in text or "402" in text:
        return DomainError(
            "INSUFFICIENT_TELEPHONY_BALANCE",
            "VoBiz account balance is insufficient. Please recharge the VoBiz account.",
            502,
        )
    return DomainError("VOBIZ_CALL_FAILED", f"VoBiz call failed: {message}", 502)


# --------------------------------------------------------------------- dial
async def dial_existing_call(db: AsyncSession, call: Call) -> tuple[bool, str | None, str | None]:
    """Dial a Call row that is already in 'initiating' status.

    Returns (success, error_code, error_message). On failure the row is
    marked failed with the reason recorded — never left hanging.
    """
    try:
        telephony_preflight()
    except DomainError as exc:
        call.status = "failed"
        call.failure_reason = exc.message
        call.ended_at = utcnow()
        await db.commit()
        return False, exc.code, exc.message

    try:
        from app.telephony.vobiz import TelephonyError, VoBizClient
    except ImportError as exc:
        call.status = "failed"
        call.failure_reason = f"Telephony module unavailable: {exc}"
        call.ended_at = utcnow()
        await db.commit()
        return False, "TELEPHONY_NOT_CONFIGURED", call.failure_reason

    client = VoBizClient()
    try:
        call_uuid = await client.dial(
            to=call.phone,
            from_number=settings.VOBIZ_FROM_NUMBER,
            answer_url=_webhook_url("answer", call.id),
            hangup_url=_webhook_url("hangup", call.id),
            recording_url=_webhook_url("recording", call.id),
        )
    except TelephonyError as exc:
        mapped = _map_carrier_error(str(exc))
        call.status = "failed"
        call.failure_reason = mapped.message
        call.ended_at = utcnow()
        await db.commit()
        return False, mapped.code, mapped.message
    except Exception as exc:  # carrier client bugs must not strand the row
        logger.exception("Unexpected dial failure for call %s", call.id)
        call.status = "failed"
        call.failure_reason = str(exc)
        call.ended_at = utcnow()
        await db.commit()
        return False, "VOBIZ_CALL_FAILED", str(exc)

    if not call_uuid:
        call.status = "failed"
        call.failure_reason = "Carrier returned no call UUID."
        call.ended_at = utcnow()
        await db.commit()
        return False, "VOBIZ_CALL_FAILED", call.failure_reason

    call.provider_call_uuid = call_uuid
    call.status = "ringing"
    call.started_at = utcnow()
    await db.commit()
    return True, None, None


# -------------------------------------------------------------- single call
async def initiate_call(
    db: AsyncSession,
    user: User,
    agent_id: str,
    phone_raw: str,
    contact_id: str | None = None,
) -> Call:
    phone = normalize_phone(phone_raw)
    agent = await _get_agent(db, user, agent_id)

    blocked = await gates.is_blocked(db, user.tenant_id, phone)
    if blocked:
        raise DomainError(
            "CONTACT_OPTED_OUT",
            "This number has opted out of calls (do-not-call / consent denied).",
            400,
        )

    telephony_preflight()

    limit = min(agent.concurrency or settings.MAX_CONCURRENT_CALLS_PER_AGENT,
                settings.MAX_CONCURRENT_CALLS_PER_AGENT)
    if await _active_count(db, agent.id) >= limit:
        raise DomainError(
            "AGENT_CONCURRENCY_LIMIT",
            f"Agent already has {limit} active calls.",
            429,
        )

    call = Call(
        tenant_id=user.tenant_id,
        agent_id=agent.id,
        contact_id=contact_id,
        phone=phone,
        status="initiating",
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)

    ok, code, message = await dial_existing_call(db, call)
    if not ok:
        raise DomainError(code or "VOBIZ_CALL_FAILED", message or "Call failed.", 502)
    await db.refresh(call)
    return call


# -------------------------------------------------------------------- batch
async def enqueue_batch(
    db: AsyncSession,
    user: User,
    agent_id: str,
    items: list[dict],
    campaign_id: str | None = None,
    enforce_hours: bool = True,
) -> tuple[list[Call], list[dict]]:
    """Create queued Call rows. Invalid or DNC-blocked numbers are reported
    in `errors` and are NEVER queued for dialling."""
    agent = await _get_agent(db, user, agent_id)
    created: list[Call] = []
    errors: list[dict] = []
    for item in items:
        raw = item.get("phone", "")
        try:
            phone = normalize_phone(raw)
        except DomainError as exc:
            errors.append({"phone": raw, "error": exc.code, "message": exc.message})
            continue
        blocked = await gates.is_blocked(db, user.tenant_id, phone)
        if blocked:
            errors.append(
                {"phone": phone, "error": "CONTACT_OPTED_OUT",
                 "message": "Number is on the do-not-call list or consent was denied."}
            )
            continue
        call = Call(
            tenant_id=user.tenant_id,
            agent_id=agent.id,
            contact_id=item.get("contact_id"),
            campaign_id=campaign_id,
            phone=phone,
            status="queued",
        )
        db.add(call)
        created.append(call)
    await db.commit()
    for call in created:
        await db.refresh(call)
    return created, errors


# ------------------------------------------------------------------- hangup
async def hangup_call(db: AsyncSession, user: User, call_id: str) -> Call:
    call = (
        await db.execute(
            select(Call).where(Call.id == call_id, Call.tenant_id == user.tenant_id)
        )
    ).scalar_one_or_none()
    if call is None:
        raise DomainError("CALL_NOT_FOUND", "Call not found.", 404)
    if call.provider_call_uuid:
        try:
            from app.telephony.vobiz import VoBizClient

            await VoBizClient().hangup(call.provider_call_uuid)
        except Exception as exc:  # best effort — the row is finalised regardless
            logger.warning("Carrier hangup failed for call %s: %s", call.id, exc)
    if call.status in ACTIVE_STATUSES or call.status == "queued":
        call.status = "completed"
        call.ended_at = utcnow()
        if call.started_at:
            call.duration_seconds = (call.ended_at - call.started_at).total_seconds()
        await db.commit()
    return call
