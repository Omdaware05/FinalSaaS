import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_current_user, get_db, scoped_user
from app.errors import DomainError
from app.models import Agent, Call, Campaign, Contact, User, utcnow
from app.serializers import campaign_out
from app.services import call_service, tenant_config
from app.telephony.vobiz import VoBizClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignIn(BaseModel):
    name: str
    description: str = ""
    agent_id: str
    questionnaire_id: str | None = None
    contact_ids: list[str] = Field(default_factory=list)
    phone_numbers: list[str] = Field(default_factory=list)
    concurrency: int = 5
    provider: str = "vobiz"


async def _counts(db: AsyncSession, campaign_id: str) -> dict:
    rows = (
        await db.execute(
            select(Call.status, func.count(Call.id))
            .where(Call.campaign_id == campaign_id)
            .group_by(Call.status)
        )
    ).all()
    return {status: count for status, count in rows}


def _out(c: Campaign, counts: dict | None = None) -> dict:
    return campaign_out(c, counts)


async def _get(db: AsyncSession, tenant_id: str, campaign_id: str) -> Campaign:
    campaign = (
        await db.execute(
            select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if campaign is None:
        raise DomainError("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404)
    return campaign


async def _balance_preflight(db: AsyncSession, tenant_id: str) -> None:
    """Honest pre-flight: a readable zero/negative VoBiz balance blocks the
    campaign; an unreadable balance endpoint only warns (same policy as before,
    but with per-tenant credentials)."""
    try:
        resolved = await tenant_config.resolve_vobiz(db, tenant_id)
        if not resolved["configured"]:
            return  # telephony_preflight already raised for configuration
        balance = await VoBizClient(
            auth_id=resolved["auth_id"], auth_token=resolved["auth_token"]
        ).get_balance()
    except Exception as exc:
        logger.warning("VoBiz balance pre-flight failed: %s", exc)
        return
    if balance is not None and balance <= 0:
        raise DomainError(
            "INSUFFICIENT_TELEPHONY_BALANCE",
            "The VoBiz account balance appears to be zero or negative. Top up the "
            "carrier balance before starting a campaign.",
            422,
        )


@router.get("")
async def list_campaigns(tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Campaign).where(Campaign.tenant_id == tenant_id).order_by(Campaign.created_at.desc())
        )
    ).scalars().all()
    return [_out(c, await _counts(db, c.id)) for c in rows]


@router.post("", status_code=201)
async def create_campaign(body: CampaignIn,
                          tenant_id: str = Depends(get_active_tenant),
                          db: AsyncSession = Depends(get_db)):
    agent = (
        await db.execute(
            select(Agent).where(Agent.id == body.agent_id, Agent.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if agent is None:
        raise DomainError("AGENT_NOT_FOUND", "Agent not found.", 404)
    contacts = []
    if body.contact_ids:
        contacts = (
            await db.execute(
                select(Contact).where(
                    Contact.id.in_(body.contact_ids), Contact.tenant_id == tenant_id
                )
            )
        ).scalars().all()
        if len(contacts) != len(set(body.contact_ids)):
            raise DomainError("CONTACT_NOT_FOUND", "One or more contacts were not found.", 404)
    campaign = Campaign(
        tenant_id=tenant_id, name=body.name, description=body.description,
        agent_id=body.agent_id, questionnaire_id=body.questionnaire_id,
        contact_ids=[c.id for c in contacts],
        phone_numbers=list(body.phone_numbers or []),
        concurrency=max(1, min(20, int(body.concurrency or 5))),
        provider=body.provider or "vobiz",
        status="draft",
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return _out(campaign, {})


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    campaign = await _get(db, tenant_id, campaign_id)
    return _out(campaign, await _counts(db, campaign_id))


@router.post("/{campaign_id}/start")
async def start_campaign(campaign_id: str, user: User = Depends(get_current_user),
                         tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    campaign = await _get(db, tenant_id, campaign_id)
    if campaign.status == "running":
        raise DomainError("CAMPAIGN_ALREADY_RUNNING", "Campaign is already running.", 409)
    suser = scoped_user(user, tenant_id)
    await call_service.telephony_preflight_for(db, tenant_id)
    await _balance_preflight(db, tenant_id)
    items: list[dict] = []
    if campaign.contact_ids:
        contacts = (
            await db.execute(
                select(Contact).where(Contact.id.in_(campaign.contact_ids))
            )
        ).scalars().all()
        items.extend({"phone": c.phone, "contact_id": c.id} for c in contacts)
    items.extend({"phone": p} for p in (campaign.phone_numbers or []))
    created, errors = await call_service.enqueue_batch(
        db, suser, campaign.agent_id, items, campaign_id=campaign.id
    )
    campaign.status = "running"
    campaign.started_at = utcnow()
    await db.commit()
    await db.refresh(campaign)
    return {
        **_out(campaign, await _counts(db, campaign.id)),
        "success": True,
        "queued": len(created),
        "blocked": len(errors),
        "errors": errors,
        "message": f"Campaign started: {len(created)} call(s) queued.",
    }


@router.post("/{campaign_id}/stop")
async def stop_campaign(campaign_id: str, tenant_id: str = Depends(get_active_tenant),
                        db: AsyncSession = Depends(get_db)):
    from sqlalchemy import update

    campaign = await _get(db, tenant_id, campaign_id)
    campaign.status = "cancelled"
    result = await db.execute(
        update(Call)
        .where(Call.campaign_id == campaign.id, Call.status == "queued")
        .values(status="cancelled", failure_reason="Campaign stopped.")
    )
    await db.commit()
    await db.refresh(campaign)
    return {
        **_out(campaign, await _counts(db, campaign.id)),
        "success": True,
        "cancelled_queued": result.rowcount or 0,
        "message": "Campaign stopped.",
    }
