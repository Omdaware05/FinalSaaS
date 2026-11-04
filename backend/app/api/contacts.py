import csv
import io

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_current_user, get_db
from app.errors import DomainError
from app.models import Call, Contact, User
from app.serializers import contact_out
from app.services.phone import normalize_phone

router = APIRouter(prefix="/contacts", tags=["contacts"])


class ContactIn(BaseModel):
    name: str = ""
    phone: str = ""
    phone_number: str = ""
    email: str = ""
    agent_id: str | None = None
    consent_status: str = "unknown"
    consent_source: str = ""
    notes: str = ""
    custom_fields: dict = Field(default_factory=dict)


class ContactPatch(BaseModel):
    name: str | None = None
    phone: str | None = None
    phone_number: str | None = None
    email: str | None = None
    agent_id: str | None = None
    status: str | None = None
    consent_status: str | None = None
    consent_source: str | None = None
    notes: str | None = None
    custom_fields: dict | None = None


async def _out(db: AsyncSession, c: Contact) -> dict:
    stats = (
        await db.execute(
            select(func.count(Call.id), func.max(Call.created_at))
            .where(Call.tenant_id == c.tenant_id, Call.phone == c.phone)
        )
    ).one()
    last_call = (
        await db.execute(
            select(Call).where(Call.tenant_id == c.tenant_id, Call.phone == c.phone)
            .order_by(Call.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    last_interest = None
    if last_call and last_call.disposition == "interested":
        last_interest = "interested"
    elif last_call and last_call.disposition == "not_interested":
        last_interest = "not_interested"
    return contact_out(
        c,
        interaction_count=stats[0] or 0,
        last_call_id=last_call.id if last_call else None,
        last_call_at=stats[1],
        last_interest_status=last_interest,
    )


async def _get(db: AsyncSession, tenant_id: str, contact_id: str) -> Contact:
    contact = (
        await db.execute(
            select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if contact is None:
        raise DomainError("CONTACT_NOT_FOUND", "Contact not found.", 404)
    return contact


@router.get("")
async def list_contacts(tenant_id: str = Depends(get_active_tenant),
                        db: AsyncSession = Depends(get_db),
                        limit: int = 200, offset: int = 0, skip: int = 0):
    rows = (
        await db.execute(
            select(Contact).where(Contact.tenant_id == tenant_id)
            .order_by(Contact.created_at).limit(min(limit, 1000)).offset(offset or skip)
        )
    ).scalars().all()
    return [await _out(db, c) for c in rows]


@router.post("", status_code=201)
async def create_contact(body: ContactIn, user: User = Depends(get_current_user),
                         tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(body.phone_number or body.phone)
    # create-or-update semantics (old UI's createOrUpdateContact)
    existing = (
        await db.execute(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone == phone)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if body.name:
            existing.name = body.name
        if body.email:
            existing.email = body.email
        if body.agent_id is not None:
            existing.agent_id = body.agent_id
        if body.custom_fields:
            existing.custom_fields = {**(existing.custom_fields or {}), **body.custom_fields}
        await db.commit()
        await db.refresh(existing)
        return await _out(db, existing)
    contact = Contact(
        tenant_id=tenant_id, name=body.name, phone=phone, email=body.email,
        agent_id=body.agent_id, consent_status=body.consent_status or "unknown",
        consent_source=body.consent_source, notes=body.notes,
        custom_fields=body.custom_fields or {},
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return await _out(db, contact)


@router.get("/{contact_id}")
async def get_contact(contact_id: str, tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    return await _out(db, await _get(db, tenant_id, contact_id))


@router.patch("/{contact_id}")
async def patch_contact(contact_id: str, body: ContactPatch,
                        tenant_id: str = Depends(get_active_tenant),
                        db: AsyncSession = Depends(get_db)):
    contact = await _get(db, tenant_id, contact_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("phone_number") and not data.get("phone"):
        data["phone"] = data.pop("phone_number")
    else:
        data.pop("phone_number", None)
    if data.get("phone"):
        data["phone"] = normalize_phone(data["phone"])
    for key, value in data.items():
        setattr(contact, key, value)
    await db.commit()
    await db.refresh(contact)
    return await _out(db, contact)


@router.put("/{contact_id}")
async def put_contact(contact_id: str, body: ContactPatch,
                      tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    return await patch_contact(contact_id, body, tenant_id, db)


@router.delete("/{contact_id}")
async def delete_contact(contact_id: str, tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    contact = await _get(db, tenant_id, contact_id)
    await db.delete(contact)
    await db.commit()
    return {"deleted": True, "success": True, "contact_id": contact_id, "id": contact_id}


@router.post("/{contact_id}/opt-out")
async def opt_out(contact_id: str, tenant_id: str = Depends(get_active_tenant),
                  db: AsyncSession = Depends(get_db)):
    contact = await _get(db, tenant_id, contact_id)
    from app.models import utcnow

    contact.status = "do_not_call"
    contact.consent_status = "denied"
    contact.consent_at = utcnow()
    await db.commit()
    await db.refresh(contact)
    return await _out(db, contact)


async def _import_csv(db: AsyncSession, tenant_id: str, file: UploadFile,
                      agent_id: str | None) -> dict:
    raw = await file.read()
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise DomainError("INVALID_CSV", "CSV file is empty or unreadable.", 400)

    existing_phones = {
        row[0]
        for row in (
            await db.execute(select(Contact.phone).where(Contact.tenant_id == tenant_id))
        ).all()
    }
    created = 0
    skipped = 0
    duplicate_rows = 0
    errors: list[dict] = []
    seen: set[str] = set()
    total_rows = 0
    for row_number, row in enumerate(reader, start=2):
        total_rows += 1
        raw_phone = (
            row.get("phone") or row.get("phone_number") or row.get("mobile")
            or row.get("number") or ""
        ).strip()
        raw_data = ", ".join(f"{k}={v}" for k, v in row.items())
        if not raw_phone:
            skipped += 1
            errors.append({"row": row_number, "row_number": row_number,
                           "raw_data": raw_data, "error": "Missing phone number."})
            continue
        try:
            phone = normalize_phone(raw_phone)
        except DomainError as exc:
            skipped += 1
            errors.append({"row": row_number, "row_number": row_number,
                           "raw_data": raw_data, "error": exc.message})
            continue
        if phone in existing_phones or phone in seen:
            skipped += 1
            duplicate_rows += 1
            continue
        seen.add(phone)
        db.add(
            Contact(
                tenant_id=tenant_id,
                name=(row.get("name") or "").strip(),
                phone=phone,
                email=(row.get("email") or "").strip(),
                agent_id=agent_id,
                consent_status="granted",
                consent_source="csv_import",
            )
        )
        created += 1
    await db.commit()
    return {
        # clean keys (current frontend)
        "created": created, "skipped": skipped, "errors": errors,
        # old CsvImportResponse keys
        "total_rows": total_rows,
        "valid_rows": created,
        "invalid_rows": len(errors),
        "duplicate_rows": duplicate_rows,
        "imported_rows": created,
        "skipped_rows": skipped,
        "filename": file.filename,
    }


@router.post("/import")
async def import_csv(file: UploadFile = File(...),
                     user: User = Depends(get_current_user),
                     tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    return await _import_csv(db, tenant_id, file, None)


@router.post("/import-csv")
async def import_csv_alias(file: UploadFile = File(...),
                           agent_id: str | None = Form(None),
                           user: User = Depends(get_current_user),
                           tenant_id: str = Depends(get_active_tenant),
                           db: AsyncSession = Depends(get_db)):
    # old contacts.ts: POST /contacts/import-csv, multipart field "file"
    return await _import_csv(db, tenant_id, file, agent_id)
