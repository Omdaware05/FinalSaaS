import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models import Agent, Call, User

router = APIRouter(prefix="/leads", tags=["leads"])


async def _lead_rows(db: AsyncSession, user: User) -> list[dict]:
    rows = (
        await db.execute(
            select(Call, Agent.name)
            .join(Agent, Agent.id == Call.agent_id)
            .where(Call.tenant_id == user.tenant_id, Call.disposition.is_not(None))
            .order_by(Call.ended_at.desc())
        )
    ).all()
    return [
        {
            "id": call.id, "phone": call.phone, "agent_name": agent_name,
            "disposition": call.disposition, "lead_score": call.lead_score,
            "lead_summary": call.lead_summary,
            "ended_at": call.ended_at.isoformat() if call.ended_at else None,
        }
        for call, agent_name in rows
    ]


@router.get("")
async def list_leads(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _lead_rows(db, user)


@router.get("/export.xlsx")
async def export_leads(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from openpyxl import Workbook

    leads = await _lead_rows(db, user)
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"
    ws.append(["Call ID", "Phone", "Agent", "Disposition", "Lead Score", "Summary", "Ended At"])
    for lead in leads:
        ws.append([
            lead["id"], lead["phone"], lead["agent_name"], lead["disposition"],
            lead["lead_score"], lead["lead_summary"], lead["ended_at"],
        ])
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=leads.xlsx"},
    )
