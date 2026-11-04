import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db, user_tenant_ids
from app.errors import DomainError
from app.models import Agent, Call, Contact, Tenant, User, UserBusiness, utcnow
from app.serializers import business_out, call_out

router = APIRouter(prefix="/businesses", tags=["businesses"])


class BusinessIn(BaseModel):
    name: str
    industry: str = ""
    email: str = ""
    phone: str = ""
    website: str = ""
    description: str = ""


class BusinessPatch(BaseModel):
    name: str | None = None
    industry: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    description: str | None = None
    is_active: bool | None = None


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "business"


async def _member_tenant(db: AsyncSession, user: User, tenant_id: str) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None or tenant_id not in await user_tenant_ids(db, user):
        raise DomainError("BUSINESS_NOT_FOUND", "Business not found.", 404)
    return tenant


async def _stats(db: AsyncSession, tenant_id: str) -> tuple[list[str], int, int, int]:
    agent_ids = (
        await db.execute(select(Agent.id).where(Agent.tenant_id == tenant_id))
    ).scalars().all()
    total_calls = (
        await db.execute(select(func.count(Call.id)).where(Call.tenant_id == tenant_id))
    ).scalar_one()
    total_leads = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant_id, Call.disposition.is_not(None)
            )
        )
    ).scalar_one()
    qualified = (
        await db.execute(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant_id, Call.disposition == "interested"
            )
        )
    ).scalar_one()
    return list(agent_ids), total_calls, total_leads, qualified


@router.get("")
async def list_businesses(user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    ids = await user_tenant_ids(db, user)
    rows = (
        await db.execute(select(Tenant).where(Tenant.id.in_(ids)).order_by(Tenant.created_at))
    ).scalars().all()
    out = []
    for tenant in rows:
        agent_ids, calls, leads, qualified = await _stats(db, tenant.id)
        out.append(business_out(tenant, agent_ids, calls, leads, qualified))
    return out


@router.post("", status_code=201)
async def create_business(body: BusinessIn, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    base_slug = _slugify(body.name)
    slug = base_slug
    suffix = 2
    while (
        await db.execute(select(Tenant).where(Tenant.slug == slug))
    ).scalar_one_or_none() is not None:
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    tenant = Tenant(
        name=body.name, slug=slug, industry=body.industry, email=body.email,
        phone=body.phone, website=body.website, description=body.description,
    )
    db.add(tenant)
    await db.flush()
    db.add(UserBusiness(user_id=user.id, tenant_id=tenant.id, role="admin"))
    await db.commit()
    await db.refresh(tenant)
    return business_out(tenant, [], 0, 0, 0)


@router.get("/{business_id}")
async def get_business(business_id: str, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    tenant = await _member_tenant(db, user, business_id)
    agent_ids, calls, leads, qualified = await _stats(db, tenant.id)
    return business_out(tenant, agent_ids, calls, leads, qualified)


@router.patch("/{business_id}")
async def patch_business(business_id: str, body: BusinessPatch,
                         user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    tenant = await _member_tenant(db, user, business_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(tenant, key, value)
    tenant.updated_at = utcnow()
    await db.commit()
    await db.refresh(tenant)
    agent_ids, calls, leads, qualified = await _stats(db, tenant.id)
    return business_out(tenant, agent_ids, calls, leads, qualified)


@router.put("/{business_id}")
async def put_business(business_id: str, body: BusinessPatch,
                       user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    return await patch_business(business_id, body, user, db)


@router.delete("/{business_id}")
async def delete_business(business_id: str, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    tenant = await _member_tenant(db, user, business_id)
    if tenant.id == user.tenant_id:
        raise DomainError(
            "CANNOT_DELETE_HOME", "Your home workspace cannot be deleted.", 400
        )
    tenant.is_active = False
    tenant.updated_at = utcnow()
    await db.commit()
    return {"deleted": True, "success": True, "business_id": tenant.id}


@router.get("/{business_id}/dashboard")
async def business_dashboard(business_id: str, user: User = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    tenant = await _member_tenant(db, user, business_id)
    agent_ids, total_calls, total_leads, qualified = await _stats(db, tenant.id)
    total_contacts = (
        await db.execute(select(func.count(Contact.id)).where(Contact.tenant_id == tenant.id))
    ).scalar_one()
    recent = (
        await db.execute(
            select(Call).where(Call.tenant_id == tenant.id)
            .order_by(Call.created_at.desc()).limit(10)
        )
    ).scalars().all()
    return {
        "business_id": tenant.id,
        "business": business_out(tenant, agent_ids, total_calls, total_leads, qualified),
        "agents": len(agent_ids),
        "total_agents": len(agent_ids),
        "contacts": total_contacts,
        "total_contacts": total_contacts,
        "calls": total_calls,
        "total_calls": total_calls,
        "leads": total_leads,
        "total_leads": total_leads,
        "qualified_leads": qualified,
        "recent_calls": [call_out(c) for c in recent],
    }


@router.post("/{business_id}/agents/{agent_id}/assign")
async def assign_agent(business_id: str, agent_id: str,
                       user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    await _member_tenant(db, user, business_id)
    agent = await db.get(Agent, agent_id)
    member_ids = await user_tenant_ids(db, user)
    if agent is None or agent.tenant_id not in member_ids:
        raise DomainError("AGENT_NOT_FOUND", "Agent not found in your businesses.", 404)
    agent.tenant_id = business_id
    await db.commit()
    return {"success": True, "agent_id": agent_id, "business_id": business_id,
            "message": "Agent assigned to business."}


@router.post("/{business_id}/agents/{agent_id}/unassign")
async def unassign_agent(business_id: str, agent_id: str,
                         user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    await _member_tenant(db, user, business_id)
    agent = await db.get(Agent, agent_id)
    if agent is None or agent.tenant_id != business_id:
        raise DomainError("AGENT_NOT_FOUND", "Agent is not assigned to this business.", 404)
    agent.tenant_id = user.tenant_id
    await db.commit()
    return {"success": True, "agent_id": agent_id, "business_id": business_id,
            "message": "Agent moved back to your home workspace."}
