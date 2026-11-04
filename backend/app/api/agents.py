from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.errors import DomainError
from app.models import Agent, User

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentIn(BaseModel):
    name: str
    purpose: str = ""
    company_name: str = ""
    company_description: str = ""
    greeting_message: str = ""
    instructions: str = ""
    voice_id: str = "shubh"
    language: str = "hi"
    enabled: bool = True
    concurrency: int = 5


class AgentPatch(BaseModel):
    name: str | None = None
    purpose: str | None = None
    company_name: str | None = None
    company_description: str | None = None
    greeting_message: str | None = None
    instructions: str | None = None
    voice_id: str | None = None
    language: str | None = None
    enabled: bool | None = None
    concurrency: int | None = None


def _out(a: Agent) -> dict:
    return {
        "id": a.id, "name": a.name, "purpose": a.purpose,
        "company_name": a.company_name, "company_description": a.company_description,
        "greeting_message": a.greeting_message, "instructions": a.instructions,
        "voice_id": a.voice_id, "language": a.language, "enabled": a.enabled,
        "concurrency": a.concurrency,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


async def _get(db: AsyncSession, user: User, agent_id: str) -> Agent:
    agent = (
        await db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.tenant_id == user.tenant_id)
        )
    ).scalar_one_or_none()
    if agent is None:
        raise DomainError("AGENT_NOT_FOUND", "Agent not found.", 404)
    return agent


@router.get("")
async def list_agents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Agent).where(Agent.tenant_id == user.tenant_id).order_by(Agent.created_at)
        )
    ).scalars().all()
    return [_out(a) for a in rows]


@router.post("", status_code=201)
async def create_agent(body: AgentIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    agent = Agent(tenant_id=user.tenant_id, **body.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return _out(agent)


@router.get("/{agent_id}")
async def get_agent(agent_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _out(await _get(db, user, agent_id))


@router.patch("/{agent_id}")
async def patch_agent(agent_id: str, body: AgentPatch, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    agent = await _get(db, user, agent_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(agent, key, value)
    await db.commit()
    await db.refresh(agent)
    return _out(agent)


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    agent = await _get(db, user, agent_id)
    agent.enabled = False  # soft delete: history/calls stay intact
    await db.commit()
    return {"success": True, "id": agent.id, "enabled": False}
