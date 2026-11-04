import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.errors import DomainError
from app.models import Call, Campaign, Contact, User, utcnow
from app.services import call_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignIn(BaseModel):
    name: str
    agent_id: str
    contact_ids: list[str] = []


def _out(c: Campaign) -> dict:
    return {
        "id": c.id, "name": c.name, "agent_id": c.agent_id, "status": c.status,
        "contact_ids": c.contact_ids or [],
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "started_at": c.started_at.isoformat() if c.started_at else None,
    }


async def _get(db: AsyncSession, user: User, campaign_id: str) -> Campaign:
    campaign = (
        await db.execute(
            select(Campaign).where(Campaign.id == campaign_id, Campaign.tenant_id == user.tenant_id)
        )
    ).scalar_one_or_none()
    if campaign is None:
        raise DomainError("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404)
    return campaign


async def _balance_preflight() -> None:
    """Fail fast on a known-empty carrier wallet; proceed (with a warning)
    when the balance simply cannot be read."""
    try:
        from app.telephony.vobiz import VoBizClient

        balance = await VoBizClient().get_balance()
    except Exception as exc:
        logger.warning("VoBiz balance preflight unavailable: %s", exc)
        return
    if balance is not None and balance <= 0:
        raise DomainError(
            "INSUFFICIENT_TELEPHONY_BALANCE",
            "VoBiz account balance is empty. Please recharge before starting a campaign.",
            422,
        )


@router.post("", status_code=201)
async def create_campaign(body: CampaignIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await call_service._get_agent(db, user, body.agent_id)  # validates agent + tenant
    contacts = (
        await db.execute(
            select(Contact).where(
                Contact.id.in_(body.contact_ids), Contact.tenant_id == user.tenant_id
            )
        )
    ).scalars().all()
    campaign = Campaign(
        tenant_id=user.tenant_id,
        agent_id=body.agent_id,
        name=body.name,
        contact_ids=[c.id for c in contacts],
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return _out(campaign)


@router.post("/{campaign_id}/start")
async def start_campaign(campaign_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    campaign = await _get(db, user, campaign_id)
    if campaign.status == "running":
        raise DomainError("CAMPAIGN_ALREADY_RUNNING", "Campaign is already running.", 409)
    call_service.telephony_preflight()
    await _balance_preflight()

    contacts = (
        await db.execute(
            select(Contact).where(
                Contact.id.in_(campaign.contact_ids or []), Contact.tenant_id == user.tenant_id
            )
        )
    ).scalars().all()
    items = [{"phone": c.phone, "contact_id": c.id} for c in contacts]
    created, errors = await call_service.enqueue_batch(
        db, user, campaign.agent_id, items, campaign_id=campaign.id
    )
    blocked = sum(1 for e in errors if e["error"] == "CONTACT_OPTED_OUT")
    campaign.status = "running"
    campaign.started_at = utcnow()
    await db.commit()
    await db.refresh(campaign)
    data = _out(campaign)
    data.update({"queued": len(created), "blocked": blocked, "errors": errors})
    return data


@router.get("")
async def list_campaigns(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Campaign).where(Campaign.tenant_id == user.tenant_id).order_by(Campaign.created_at.desc())
        )
    ).scalars().all()
    return [_out(c) for c in rows]


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    campaign = await _get(db, user, campaign_id)
    counts_rows = (
        await db.execute(
            select(Call.status, func.count(Call.id))
            .where(Call.campaign_id == campaign.id)
            .group_by(Call.status)
        )
    ).all()
    data = _out(campaign)
    data["call_counts"] = {status: count for status, count in counts_rows}
    return data
