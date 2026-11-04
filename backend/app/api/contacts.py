import csv
import io

from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.errors import DomainError
from app.models import Contact, User, utcnow
from app.services.phone import normalize_phone

router = APIRouter(prefix="/contacts", tags=["contacts"])


class ContactIn(BaseModel):
    name: str = ""
    phone: str
    email: str = ""
    consent_status: str = "unknown"
    consent_source: str = ""
    notes: str = ""


def _out(c: Contact) -> dict:
    return {
        "id": c.id, "name": c.name, "phone": c.phone, "email": c.email,
        "status": c.status, "consent_status": c.consent_status,
        "consent_source": c.consent_source,
        "consent_at": c.consent_at.isoformat() if c.consent_at else None,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


async def _get(db: AsyncSession, user: User, contact_id: str) -> Contact:
    contact = (
        await db.execute(
            select(Contact).where(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
        )
    ).scalar_one_or_none()
    if contact is None:
        raise DomainError("CONTACT_NOT_FOUND", "Contact not found.", 404)
    return contact


@router.get("")
async def list_contacts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Contact).where(Contact.tenant_id == user.tenant_id).order_by(Contact.created_at)
        )
    ).scalars().all()
    return [_out(c) for c in rows]


@router.post("", status_code=201)
async def create_contact(body: ContactIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(body.phone)
    contact = Contact(
        tenant_id=user.tenant_id,
        name=body.name, phone=phone, email=body.email,
        consent_status=body.consent_status if body.consent_status in ("granted", "unknown", "denied") else "unknown",
        consent_source=body.consent_source, notes=body.notes,
        consent_at=utcnow() if body.consent_status == "granted" else None,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return _out(contact)


@router.get("/{contact_id}")
async def get_contact(contact_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _out(await _get(db, user, contact_id))


@router.delete("/{contact_id}")
async def delete_contact(contact_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    contact = await _get(db, user, contact_id)
    await db.delete(contact)
    await db.commit()
    return {"success": True, "id": contact_id}


@router.post("/{contact_id}/opt-out")
async def opt_out(contact_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    contact = await _get(db, user, contact_id)
    contact.status = "do_not_call"
    contact.consent_status = "denied"
    contact.consent_at = utcnow()
    await db.commit()
    return _out(contact)


@router.post("/import")
async def import_contacts(file: UploadFile, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise DomainError("INVALID_CSV", "CSV file must be UTF-8 encoded.", 400)
    reader = csv.DictReader(io.StringIO(text))
    created, skipped, errors = 0, 0, []
    existing = {
        c.phone
        for c in (
            await db.execute(select(Contact).where(Contact.tenant_id == user.tenant_id))
        ).scalars().all()
    }
    for row_no, row in enumerate(reader, start=2):
        raw_phone = (row.get("phone") or "").strip()
        if not raw_phone:
            skipped += 1
            errors.append({"row": row_no, "error": "INVALID_PHONE_NUMBER", "message": "Missing phone"})
            continue
        try:
            phone = normalize_phone(raw_phone)
        except DomainError as exc:
            skipped += 1
            errors.append({"row": row_no, "error": exc.code, "message": exc.message})
            continue
        if phone in existing:
            skipped += 1
            errors.append({"row": row_no, "error": "DUPLICATE", "message": "Contact already exists"})
            continue
        consent = (row.get("consent_status") or "unknown").strip().lower()
        if consent not in ("granted", "unknown", "denied"):
            consent = "unknown"
        db.add(
            Contact(
                tenant_id=user.tenant_id,
                name=(row.get("name") or "").strip(),
                phone=phone,
                email=(row.get("email") or "").strip(),
                consent_status=consent,
                consent_source=(row.get("consent_source") or "csv_import").strip(),
                consent_at=utcnow() if consent == "granted" else None,
            )
        )
        existing.add(phone)
        created += 1
    await db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}
