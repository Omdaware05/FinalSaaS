from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_current_user, get_db, scoped_user
from app.errors import DomainError
from app.models import Agent, Call, Contact, User
from app.serializers import agent_out, call_out
from app.services import call_service, gates
from app.services.phone import normalize_phone

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentIn(BaseModel):
    name: str
    purpose: str = ""
    description: str | None = None  # old UI alias of purpose
    company_name: str = ""
    company_description: str = ""
    greeting_message: str = ""
    instructions: str = ""
    system_prompt: str | None = None  # old UI alias of instructions
    voice_id: str = "shubh"
    voice_name: str = ""
    voice_gender: str = ""
    tts_provider: str = "sarvam"
    language: str = "hi"
    language_mode: str = "auto_match"
    primary_language: str = "hi"
    default_language: str = "Hindi"
    supported_languages: list[str] = []
    speaking_speed: float = 1.0
    telephony_provider: str = "vobiz"
    provider: str | None = None  # old UI alias of telephony_provider
    telephony_from_number: str | None = None
    questionnaire_id: str | None = None
    enabled: bool = True
    is_enabled: bool | None = None  # old UI alias of enabled
    concurrency: int = 5


class AgentPatch(BaseModel):
    name: str | None = None
    purpose: str | None = None
    description: str | None = None
    company_name: str | None = None
    company_description: str | None = None
    greeting_message: str | None = None
    instructions: str | None = None
    system_prompt: str | None = None
    voice_id: str | None = None
    voice_name: str | None = None
    voice_gender: str | None = None
    tts_provider: str | None = None
    language: str | None = None
    language_mode: str | None = None
    primary_language: str | None = None
    default_language: str | None = None
    supported_languages: list[str] | None = None
    speaking_speed: float | None = None
    telephony_provider: str | None = None
    provider: str | None = None
    telephony_from_number: str | None = None
    questionnaire_id: str | None = None
    enabled: bool | None = None
    is_enabled: bool | None = None
    concurrency: int | None = None


def _normalize(data: dict) -> dict:
    """Fold old-UI alias fields into the canonical column names."""
    if data.get("description") is not None and not data.get("purpose"):
        data["purpose"] = data.pop("description")
    else:
        data.pop("description", None)
    if data.get("system_prompt") is not None and not data.get("instructions"):
        data["instructions"] = data.pop("system_prompt")
    else:
        data.pop("system_prompt", None)
    if data.get("provider") is not None and not data.get("telephony_provider"):
        data["telephony_provider"] = data.pop("provider")
    else:
        data.pop("provider", None)
    if data.get("is_enabled") is not None:
        data["enabled"] = data.pop("is_enabled")
    else:
        data.pop("is_enabled", None)
    return data


def _out(a: Agent) -> dict:
    return agent_out(a)


async def _get(db: AsyncSession, tenant_id: str, agent_id: str) -> Agent:
    agent = (
        await db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if agent is None:
        raise DomainError("AGENT_NOT_FOUND", "Agent not found.", 404)
    return agent


@router.get("")
async def list_agents(
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
    tenant_id: str = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Agent).where(Agent.tenant_id == tenant_id)
            .order_by(Agent.created_at).limit(limit).offset(skip)
        )
    ).scalars().all()
    return [_out(a) for a in rows]


@router.post("", status_code=201)
async def create_agent(body: AgentIn, user: User = Depends(get_current_user),
                       tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    agent = Agent(tenant_id=tenant_id, **_normalize(body.model_dump()))
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return _out(agent)


@router.get("/{agent_id}")
async def get_agent(agent_id: str, tenant_id: str = Depends(get_active_tenant),
                    db: AsyncSession = Depends(get_db)):
    return _out(await _get(db, tenant_id, agent_id))


async def _apply_patch(db: AsyncSession, tenant_id: str, agent_id: str, body: AgentPatch) -> Agent:
    agent = await _get(db, tenant_id, agent_id)
    for key, value in _normalize(body.model_dump(exclude_unset=True)).items():
        setattr(agent, key, value)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.patch("/{agent_id}")
async def patch_agent(agent_id: str, body: AgentPatch, tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    return _out(await _apply_patch(db, tenant_id, agent_id, body))


@router.put("/{agent_id}")
async def put_agent(agent_id: str, body: AgentPatch, tenant_id: str = Depends(get_active_tenant),
                    db: AsyncSession = Depends(get_db)):
    # old UI updates agents with PUT
    return _out(await _apply_patch(db, tenant_id, agent_id, body))


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    agent = await _get(db, tenant_id, agent_id)
    agent.enabled = False  # soft delete: history/calls stay intact
    await db.commit()
    return {"deleted": True, "success": True, "agent_id": agent.id, "id": agent.id, "enabled": False}


@router.post("/{agent_id}/toggle")
async def toggle_agent(agent_id: str, tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    agent = await _get(db, tenant_id, agent_id)
    agent.enabled = not agent.enabled
    await db.commit()
    await db.refresh(agent)
    return _out(agent)


@router.post("/{agent_id}/duplicate")
async def duplicate_agent(agent_id: str, tenant_id: str = Depends(get_active_tenant),
                          db: AsyncSession = Depends(get_db)):
    src = await _get(db, tenant_id, agent_id)
    clone = Agent(
        tenant_id=src.tenant_id, name=f"{src.name} (Copy)", purpose=src.purpose,
        company_name=src.company_name, company_description=src.company_description,
        greeting_message=src.greeting_message, instructions=src.instructions,
        voice_id=src.voice_id, voice_name=src.voice_name, voice_gender=src.voice_gender,
        tts_provider=src.tts_provider, language=src.language,
        language_mode=src.language_mode, primary_language=src.primary_language,
        default_language=src.default_language,
        supported_languages=list(src.supported_languages or []),
        speaking_speed=src.speaking_speed, telephony_provider=src.telephony_provider,
        telephony_from_number=src.telephony_from_number,
        questionnaire_id=src.questionnaire_id, enabled=src.enabled,
        concurrency=src.concurrency,
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    return _out(clone)


async def _call_counts(db: AsyncSession, agent_id: str) -> dict:
    rows = (
        await db.execute(
            select(Call.status, func.count(Call.id)).where(Call.agent_id == agent_id).group_by(Call.status)
        )
    ).all()
    return {status: count for status, count in rows}


@router.get("/{agent_id}/summary")
async def agent_summary(agent_id: str, tenant_id: str = Depends(get_active_tenant),
                        db: AsyncSession = Depends(get_db)):
    agent = await _get(db, tenant_id, agent_id)
    counts = await _call_counts(db, agent.id)
    total = sum(counts.values())
    active = sum(counts.get(s, 0) for s in ("initiating", "ringing", "in_progress"))
    interested = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.agent_id == agent.id, Call.disposition == "interested"
            )
        )
    ).scalar_one()
    return {
        "agent_id": agent.id, "id": agent.id, "name": agent.name,
        "description": agent.purpose, "is_enabled": agent.enabled, "enabled": agent.enabled,
        "default_language": agent.default_language,
        "provider": agent.telephony_provider or "vobiz",
        "total_calls": total, "active_calls": active,
        "completed_calls": counts.get("completed", 0), "failed_calls": counts.get("failed", 0),
        "interested_contacts": interested,
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
    }


@router.get("/{agent_id}/dashboard")
async def agent_dashboard(agent_id: str, tenant_id: str = Depends(get_active_tenant),
                          db: AsyncSession = Depends(get_db)):
    agent = await _get(db, tenant_id, agent_id)
    counts = await _call_counts(db, agent.id)
    total = sum(counts.values())
    avg_duration = (
        await db.execute(
            select(func.avg(Call.duration_seconds)).where(
                Call.agent_id == agent.id, Call.duration_seconds.is_not(None)
            )
        )
    ).scalar() or 0.0
    dispositions = (
        await db.execute(
            select(Call.disposition, func.count(Call.id))
            .where(Call.agent_id == agent.id, Call.disposition.is_not(None))
            .group_by(Call.disposition)
        )
    ).all()
    disp = {d: n for d, n in dispositions}
    recent = (
        await db.execute(
            select(Call).where(Call.agent_id == agent.id)
            .order_by(Call.created_at.desc()).limit(10)
        )
    ).scalars().all()
    return {
        "agent_id": agent.id, "agent_name": agent.name,
        "total_calls": total,
        "active_calls": sum(counts.get(s, 0) for s in ("initiating", "ringing", "in_progress")),
        "queued_calls": counts.get("queued", 0),
        "completed_calls": counts.get("completed", 0),
        "failed_calls": counts.get("failed", 0),
        "average_duration_seconds": round(float(avg_duration), 1),
        "questionnaire_completion_rate": 0.0,
        "interested_count": disp.get("interested", 0),
        "not_interested_count": disp.get("not_interested", 0),
        "uncertain_count": disp.get("unknown", 0) + disp.get("callback_requested", 0),
        "language_distribution": {agent.default_language or "Hindi": total} if total else {},
        "recent_calls": [call_out(c) for c in recent],
    }


@router.get("/{agent_id}/analytics/interest")
async def agent_interest_analytics(agent_id: str, tenant_id: str = Depends(get_active_tenant),
                                   db: AsyncSession = Depends(get_db)):
    agent = await _get(db, tenant_id, agent_id)
    dispositions = (
        await db.execute(
            select(Call.disposition, func.count(Call.id))
            .where(Call.agent_id == agent.id)
            .group_by(Call.disposition)
        )
    ).all()
    disp = {d: n for d, n in dispositions}
    total = sum(disp.values())
    interested = disp.get("interested", 0)
    not_interested = disp.get("not_interested", 0)
    uncertain = disp.get("unknown", 0) + disp.get("callback_requested", 0)
    decided = interested + not_interested
    return {
        "agent_id": agent.id,
        "interested": interested,
        "not_interested": not_interested,
        "uncertain": uncertain,
        "pending": total - decided - uncertain,
        "total_calls": total,
        "interest_rate": round(interested / decided, 3) if decided else 0.0,
        "dispositions": disp,
    }


class PreviewBatchIn(BaseModel):
    phone_numbers: list[str] = []
    phones: list[str] = []


@router.post("/{agent_id}/preview-batch")
async def preview_batch(agent_id: str, body: PreviewBatchIn,
                        tenant_id: str = Depends(get_active_tenant),
                        db: AsyncSession = Depends(get_db)):
    await _get(db, tenant_id, agent_id)
    numbers = body.phone_numbers or body.phones
    valid: list[str] = []
    invalid: list[str] = []
    results = []
    for raw in numbers:
        entry = {"phone": raw, "normalized": None, "valid": False, "blocked": False, "reason": None}
        try:
            normalized = normalize_phone(raw)
            entry["normalized"] = normalized
            entry["valid"] = True
            blocked = await gates.is_blocked(db, tenant_id, normalized)
            if blocked:
                entry["blocked"] = True
                entry["reason"] = blocked
                invalid.append(raw)
            else:
                valid.append(normalized)
        except DomainError as exc:
            entry["reason"] = exc.message
            invalid.append(raw)
        results.append(entry)
    return {"total": len(numbers), "valid": valid, "invalid": invalid, "results": results}


class StartCallsIn(BaseModel):
    phone_numbers: list[str] = []
    phones: list[str] = []
    contact_ids: list[str] = []
    concurrency: int | None = None
    provider: str | None = None
    language: str | None = None
    questionnaire_id: str | None = None


@router.post("/{agent_id}/start-calls")
async def start_calls(agent_id: str, body: StartCallsIn,
                      user: User = Depends(get_current_user),
                      tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    suser = scoped_user(user, tenant_id)
    agent = await call_service._get_agent(db, suser, agent_id)  # 404/disabled checks
    items: list[dict] = []
    numbers = body.phone_numbers or body.phones
    items.extend({"phone": p} for p in numbers)
    if body.contact_ids:
        contacts = (
            await db.execute(
                select(Contact).where(Contact.id.in_(body.contact_ids), Contact.tenant_id == tenant_id)
            )
        ).scalars().all()
        items.extend({"phone": c.phone, "contact_id": c.id} for c in contacts)
    if not items:
        raise DomainError("NO_NUMBERS", "No phone numbers or contacts provided.", 400)
    created, errors = await call_service.enqueue_batch(db, suser, agent.id, items)
    if not created:
        detail = "; ".join(e.get("message", e.get("error", "")) for e in errors) or "No valid phone numbers provided."
        raise DomainError("NO_VALID_NUMBERS", detail, 400)
    concurrency = max(1, min(20, int(body.concurrency or agent.concurrency or 5)))
    return {
        "status": "QUEUED",
        "queued": len(created),
        "call_ids": [c.id for c in created],
        "calls": [call_out(c) for c in created],
        "errors": errors,
        "concurrency": concurrency,
        "message": f"Successfully queued {len(created)} call(s) with {concurrency}x concurrency. Dialing started in background.",
    }
