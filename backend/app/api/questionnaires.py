import io
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_db
from app.errors import DomainError
from app.models import Agent, Questionnaire, utcnow
from app.serializers import questionnaire_out

router = APIRouter(prefix="/questionnaires", tags=["questionnaires"])

QUESTION_TYPES = ("open", "yes_no", "multiple_choice", "text", "long_text",
                  "single_choice", "number", "rating", "date", "language_selection", "custom")


def _normalize_questions(raw: list[dict]) -> list[dict]:
    questions = []
    for i, item in enumerate(raw or []):
        qid = item.get("question_id") or item.get("id") or f"q{i + 1}-{uuid.uuid4().hex[:6]}"
        qtype = (item.get("type") or "open").strip()
        questions.append({
            "id": qid,
            "question_id": qid,
            "text": item.get("text", ""),
            "type": qtype if qtype in QUESTION_TYPES else "open",
            "options": item.get("options") or [],
            "required": bool(item.get("required", False)),
            "expected_answer": item.get("expected_answer"),
            "description": item.get("description"),
            "conditional_rules": item.get("conditional_rules") or [],
        })
    return questions


class QuestionnaireIn(BaseModel):
    title: str
    description: str = ""
    questions: list[dict] = Field(default_factory=list)
    status: str = "draft"
    agent_id: str | None = None


class QuestionnairePatch(BaseModel):
    title: str | None = None
    description: str | None = None
    questions: list[dict] | None = None
    status: str | None = None


async def _get(db: AsyncSession, tenant_id: str, qid: str) -> Questionnaire:
    q = (
        await db.execute(
            select(Questionnaire).where(Questionnaire.id == qid, Questionnaire.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if q is None:
        raise DomainError("QUESTIONNAIRE_NOT_FOUND", "Questionnaire not found.", 404)
    return q


@router.get("")
async def list_questionnaires(tenant_id: str = Depends(get_active_tenant),
                              db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Questionnaire).where(Questionnaire.tenant_id == tenant_id)
            .order_by(Questionnaire.created_at.desc())
        )
    ).scalars().all()
    return [questionnaire_out(q) for q in rows]


@router.post("", status_code=201)
async def create_questionnaire(body: QuestionnaireIn,
                               tenant_id: str = Depends(get_active_tenant),
                               db: AsyncSession = Depends(get_db)):
    q = Questionnaire(
        tenant_id=tenant_id, title=body.title, description=body.description,
        questions=_normalize_questions(body.questions),
        status=body.status if body.status in ("draft", "published") else "draft",
        version_history=[{"version_id": "v1", "notes": "Created", "at": utcnow().isoformat()}],
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return questionnaire_out(q)


@router.get("/excel-template")
async def excel_template():
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Questions"
    ws.append(["Question", "Type", "Options", "Required"])
    ws.append(["Are you interested in our program?", "yes_no", "", "yes"])
    ws.append(["Which course do you prefer?", "multiple_choice", "B.Tech, MBA, BBA", "no"])
    ws.append(["Anything else you would like to tell us?", "open", "", "no"])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=questionnaire-template.xlsx"},
    )


@router.get("/{questionnaire_id}")
async def get_questionnaire(questionnaire_id: str,
                            tenant_id: str = Depends(get_active_tenant),
                            db: AsyncSession = Depends(get_db)):
    return questionnaire_out(await _get(db, tenant_id, questionnaire_id))


async def _apply_patch(db: AsyncSession, tenant_id: str, qid: str, body: QuestionnairePatch):
    q = await _get(db, tenant_id, qid)
    data = body.model_dump(exclude_unset=True)
    if data.get("questions") is not None:
        data["questions"] = _normalize_questions(data["questions"])
    for key, value in data.items():
        if value is not None:
            setattr(q, key, value)
    q.updated_at = utcnow()
    await db.commit()
    await db.refresh(q)
    return questionnaire_out(q)


@router.patch("/{questionnaire_id}")
async def patch_questionnaire(questionnaire_id: str, body: QuestionnairePatch,
                              tenant_id: str = Depends(get_active_tenant),
                              db: AsyncSession = Depends(get_db)):
    return await _apply_patch(db, tenant_id, questionnaire_id, body)


@router.put("/{questionnaire_id}")
async def put_questionnaire(questionnaire_id: str, body: QuestionnairePatch,
                            tenant_id: str = Depends(get_active_tenant),
                            db: AsyncSession = Depends(get_db)):
    return await _apply_patch(db, tenant_id, questionnaire_id, body)


@router.delete("/{questionnaire_id}")
async def delete_questionnaire(questionnaire_id: str,
                               tenant_id: str = Depends(get_active_tenant),
                               db: AsyncSession = Depends(get_db)):
    q = await _get(db, tenant_id, questionnaire_id)
    await db.delete(q)
    await db.commit()
    return {"deleted": True, "success": True, "questionnaire_id": questionnaire_id}


@router.post("/{questionnaire_id}/duplicate")
async def duplicate_questionnaire(questionnaire_id: str,
                                  tenant_id: str = Depends(get_active_tenant),
                                  db: AsyncSession = Depends(get_db)):
    src = await _get(db, tenant_id, questionnaire_id)
    clone = Questionnaire(
        tenant_id=src.tenant_id, title=f"{src.title} (Copy)", description=src.description,
        questions=list(src.questions or []), status="draft",
        version_history=[{"version_id": "v1", "notes": f"Duplicated from {src.id}",
                          "at": utcnow().isoformat()}],
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    return questionnaire_out(clone)


class PublishIn(BaseModel):
    notes: str = ""


@router.post("/{questionnaire_id}/publish")
async def publish_questionnaire(questionnaire_id: str, body: PublishIn | None = None,
                                tenant_id: str = Depends(get_active_tenant),
                                db: AsyncSession = Depends(get_db)):
    q = await _get(db, tenant_id, questionnaire_id)
    q.status = "published"
    history = list(q.version_history or [])
    version = f"v{len(history) + 1}"
    history.append({"version_id": version, "notes": (body.notes if body else "") or "Published",
                    "at": utcnow().isoformat()})
    q.version_history = history
    q.updated_at = utcnow()
    await db.commit()
    await db.refresh(q)
    return questionnaire_out(q)


class AssignIn(BaseModel):
    questionnaire_id: str
    agent_id: str


@router.post("/assign")
async def assign_questionnaire(body: AssignIn,
                               tenant_id: str = Depends(get_active_tenant),
                               db: AsyncSession = Depends(get_db)):
    q = await _get(db, tenant_id, body.questionnaire_id)
    agent = (
        await db.execute(
            select(Agent).where(Agent.id == body.agent_id, Agent.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if agent is None:
        raise DomainError("AGENT_NOT_FOUND", "Agent not found.", 404)
    agent.questionnaire_id = q.id
    await db.commit()
    return {"success": True, "questionnaire_id": q.id, "agent_id": agent.id,
            "message": "Questionnaire assigned to agent."}


class BatchDeleteIn(BaseModel):
    ids: list[str]


@router.post("/batch-delete")
async def batch_delete(body: BatchDeleteIn,
                       tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Questionnaire).where(
                Questionnaire.id.in_(body.ids), Questionnaire.tenant_id == tenant_id
            )
        )
    ).scalars().all()
    for q in rows:
        await db.delete(q)
    await db.commit()
    return {"success": True, "deleted_count": len(rows)}


def _questions_from_rows(rows: list[list]) -> tuple[list[dict], list[str]]:
    questions: list[dict] = []
    warnings: list[str] = []
    header_seen = False
    for idx, row in enumerate(rows, start=1):
        cells = [("" if c is None else str(c)).strip() for c in row]
        if not any(cells):
            continue
        if not header_seen and cells[0].lower() in ("question", "questions", "question text"):
            header_seen = True
            continue
        text = cells[0]
        qtype = (cells[1] if len(cells) > 1 else "open").lower().replace(" ", "_") or "open"
        options_raw = cells[2] if len(cells) > 2 else ""
        options = [o.strip() for o in options_raw.split(",") if o.strip()] if options_raw else []
        required = (cells[3].lower() in ("yes", "true", "1")) if len(cells) > 3 else False
        if qtype not in QUESTION_TYPES:
            warnings.append(f"Row {idx}: unknown type {qtype!r}, imported as 'open'.")
            qtype = "open"
        questions.append({
            "id": f"q{idx}-{uuid.uuid4().hex[:6]}",
            "question_id": f"q{idx}-{uuid.uuid4().hex[:6]}",
            "text": text, "type": qtype, "options": options, "required": required,
            "expected_answer": None, "description": None, "conditional_rules": [],
        })
    return questions, warnings


@router.post("/import-excel")
async def import_excel(file: UploadFile = File(...),
                       agent_id: str | None = Form(None),
                       title: str | None = Form(None),
                       save_to_db: str = Form("true"),
                       tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    from openpyxl import load_workbook

    raw = await file.read()
    try:
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as exc:
        raise DomainError("INVALID_EXCEL", f"Could not read Excel file: {exc}", 400)
    ws = wb.active
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    questions, warnings = _questions_from_rows(rows)
    result = {
        "success": True,
        "filename": file.filename,
        "valid_count": len(questions),
        "questions": questions,
        "warnings": warnings,
        "questionnaire": None,
    }
    if save_to_db.lower() == "true" and questions:
        q = Questionnaire(
            tenant_id=tenant_id,
            title=title or (file.filename or "Imported Questionnaire").rsplit(".", 1)[0],
            description="Imported from Excel",
            questions=questions, status="draft",
            version_history=[{"version_id": "v1", "notes": "Imported from Excel",
                              "at": utcnow().isoformat()}],
        )
        db.add(q)
        await db.commit()
        await db.refresh(q)
        result["questionnaire"] = questionnaire_out(q)
    return result


@router.post("/import-docx")
async def import_docx(file: UploadFile = File(...),
                      agent_id: str | None = Form(None),
                      tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    import re

    from docx import Document

    raw = await file.read()
    try:
        doc = Document(io.BytesIO(raw))
    except Exception as exc:
        raise DomainError("INVALID_DOCX", f"Could not read Word file: {exc}", 400)
    questions: list[dict] = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        text = re.sub(r"^\s*\d+[\.\)]\s*", "", text)
        if not text:
            continue
        qid = f"q{len(questions) + 1}-{uuid.uuid4().hex[:6]}"
        questions.append({
            "id": qid, "question_id": qid, "text": text, "type": "open",
            "options": [], "required": False, "expected_answer": None,
            "description": None, "conditional_rules": [],
        })
    q = Questionnaire(
        tenant_id=tenant_id,
        title=(file.filename or "Imported Questionnaire").rsplit(".", 1)[0],
        description="Imported from Word document",
        questions=questions, status="draft",
        version_history=[{"version_id": "v1", "notes": "Imported from DOCX",
                          "at": utcnow().isoformat()}],
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return {
        "success": True,
        "filename": file.filename,
        "valid_count": len(questions),
        "questions": questions,
        "warnings": [],
        "questionnaire": questionnaire_out(q),
    }
