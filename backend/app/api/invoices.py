from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_current_user, get_db, user_tenant_ids
from app.errors import DomainError
from app.models import Invoice, User, utcnow
from app.serializers import invoice_out

router = APIRouter(prefix="/invoices", tags=["invoices"])


class InvoiceIn(BaseModel):
    # old page payload
    business_id: str | None = None
    line_items: list[dict] = Field(default_factory=list)
    tax_rate: float = 18.0
    notes: str = ""
    # task-model payload
    items: list[dict] = Field(default_factory=list)
    customer_name: str = ""
    customer_email: str = ""
    customer_phone: str = ""
    business_name: str | None = None
    currency: str = "INR"
    status: str = "draft"
    due_date: str | None = None


class InvoicePatch(BaseModel):
    customer_name: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    business_name: str | None = None
    items: list[dict] | None = None
    line_items: list[dict] | None = None
    tax_rate: float | None = None
    currency: str | None = None
    status: str | None = None
    due_date: str | None = None
    notes: str | None = None


def _normalize_items(raw: list[dict]) -> tuple[list[dict], float]:
    items = []
    subtotal = 0.0
    for item in raw or []:
        qty = float(item.get("quantity", 1) or 1)
        rate = float(item.get("rate", item.get("unit_price", 0)) or 0)
        amount = round(qty * rate, 2)
        items.append({
            "description": item.get("description", ""),
            "quantity": qty,
            "rate": rate,
            "amount": amount,
        })
        subtotal += amount
    return items, round(subtotal, 2)


async def _resolve_tenant(db: AsyncSession, user: User, active_tenant: str,
                          business_id: str | None) -> str:
    if business_id and business_id != active_tenant:
        if business_id in await user_tenant_ids(db, user):
            return business_id
        raise DomainError("BUSINESS_NOT_FOUND", "Business not found.", 404)
    return active_tenant


async def _get(db: AsyncSession, user: User, invoice_id: str) -> Invoice:
    invoice = await db.get(Invoice, invoice_id)
    if invoice is None or invoice.tenant_id not in await user_tenant_ids(db, user):
        raise DomainError("INVOICE_NOT_FOUND", "Invoice not found.", 404)
    return invoice


async def _next_number(db: AsyncSession, tenant_id: str) -> str:
    count = (
        await db.execute(select(func.count(Invoice.id)).where(Invoice.tenant_id == tenant_id))
    ).scalar_one()
    return f"INV-{count + 1:04d}"


@router.get("")
async def list_invoices(business_id: str | None = None,
                        user: User = Depends(get_current_user),
                        tenant_id: str = Depends(get_active_tenant),
                        db: AsyncSession = Depends(get_db)):
    target = await _resolve_tenant(db, user, tenant_id, business_id)
    rows = (
        await db.execute(
            select(Invoice).where(Invoice.tenant_id == target)
            .order_by(Invoice.created_at.desc())
        )
    ).scalars().all()
    return [invoice_out(i) for i in rows]


@router.post("", status_code=201)
async def create_invoice(body: InvoiceIn, user: User = Depends(get_current_user),
                         tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    target = await _resolve_tenant(db, user, tenant_id, body.business_id)
    items, subtotal = _normalize_items(body.items or body.line_items)
    tax_amount = round(subtotal * (body.tax_rate / 100.0), 2)
    due = None
    if body.due_date:
        try:
            due = datetime.fromisoformat(body.due_date)
        except ValueError:
            raise DomainError("INVALID_DATE", "due_date must be YYYY-MM-DD.", 400)
    else:
        due = utcnow() + timedelta(days=7)
    status = (body.status or "draft").lower()
    if status == "issued":
        status = "sent"
    if status not in ("draft", "sent", "paid", "cancelled"):
        raise DomainError("INVALID_STATUS", f"Unknown invoice status {body.status!r}.", 400)
    invoice = Invoice(
        tenant_id=target,
        number=await _next_number(db, target),
        customer_name=body.customer_name, customer_email=body.customer_email,
        customer_phone=body.customer_phone, business_name=body.business_name,
        items=items, tax_rate=body.tax_rate, currency=body.currency or "INR",
        subtotal=subtotal, tax_amount=tax_amount, total=round(subtotal + tax_amount, 2),
        status=status, issue_date=utcnow(), due_date=due, notes=body.notes,
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)
    return invoice_out(invoice)


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    return invoice_out(await _get(db, user, invoice_id))


@router.patch("/{invoice_id}")
async def patch_invoice(invoice_id: str, body: InvoicePatch,
                        user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    invoice = await _get(db, user, invoice_id)
    data = body.model_dump(exclude_unset=True)
    raw_items = data.pop("items", None) or data.pop("line_items", None)
    if raw_items is not None:
        items, subtotal = _normalize_items(raw_items)
        invoice.items = items
        invoice.subtotal = subtotal
    if data.get("tax_rate") is not None:
        invoice.tax_rate = data.pop("tax_rate")
    if invoice.subtotal is not None:
        invoice.tax_amount = round(invoice.subtotal * (invoice.tax_rate / 100.0), 2)
        invoice.total = round(invoice.subtotal + invoice.tax_amount, 2)
    if data.get("due_date"):
        try:
            invoice.due_date = datetime.fromisoformat(data.pop("due_date"))
        except ValueError:
            raise DomainError("INVALID_DATE", "due_date must be YYYY-MM-DD.", 400)
    if data.get("status"):
        status = data.pop("status").lower()
        invoice.status = "sent" if status == "issued" else status
    for key, value in data.items():
        if value is not None:
            setattr(invoice, key, value)
    invoice.updated_at = utcnow()
    await db.commit()
    await db.refresh(invoice)
    return invoice_out(invoice)


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    invoice = await _get(db, user, invoice_id)
    await db.delete(invoice)
    await db.commit()
    return {"deleted": True, "success": True, "invoice_id": invoice_id}


@router.post("/{invoice_id}/mark-paid")
async def mark_paid(invoice_id: str, user: User = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    invoice = await _get(db, user, invoice_id)
    invoice.status = "paid"
    invoice.updated_at = utcnow()
    await db.commit()
    await db.refresh(invoice)
    return invoice_out(invoice)


def _invoice_pdf(invoice: Invoice) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", "B", 18)
    pdf.cell(0, 10, f"Invoice {invoice.number}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 11)
    pdf.cell(0, 7, f"Status: {invoice.status}", new_x="LMARGIN", new_y="NEXT")
    if invoice.business_name:
        pdf.cell(0, 7, f"From: {invoice.business_name}", new_x="LMARGIN", new_y="NEXT")
    if invoice.customer_name:
        pdf.cell(0, 7, f"Bill To: {invoice.customer_name}", new_x="LMARGIN", new_y="NEXT")
    if invoice.customer_email:
        pdf.cell(0, 7, f"Email: {invoice.customer_email}", new_x="LMARGIN", new_y="NEXT")
    if invoice.issue_date:
        pdf.cell(0, 7, f"Issue Date: {invoice.issue_date.isoformat()}", new_x="LMARGIN", new_y="NEXT")
    if invoice.due_date:
        pdf.cell(0, 7, f"Due Date: {invoice.due_date.isoformat()}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("helvetica", "B", 11)
    pdf.cell(90, 7, "Description")
    pdf.cell(25, 7, "Qty")
    pdf.cell(35, 7, "Rate")
    pdf.cell(35, 7, "Amount", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 11)
    for item in invoice.items or []:
        pdf.cell(90, 7, str(item.get("description", ""))[:45])
        pdf.cell(25, 7, str(item.get("quantity", 1)))
        pdf.cell(35, 7, f"{float(item.get('rate', item.get('unit_price', 0))):.2f}")
        pdf.cell(35, 7, f"{float(item.get('amount', 0)):.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    currency = invoice.currency or "INR"
    pdf.cell(0, 7, f"Subtotal: {currency} {invoice.subtotal:.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Tax ({invoice.tax_rate}%): {currency} {invoice.tax_amount:.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(0, 8, f"Total: {currency} {invoice.total:.2f}", new_x="LMARGIN", new_y="NEXT")
    if invoice.notes:
        pdf.set_font("helvetica", "", 10)
        pdf.multi_cell(0, 6, f"Notes: {invoice.notes}")
    return bytes(pdf.output())


@router.get("/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    invoice = await _get(db, user, invoice_id)
    data = _invoice_pdf(invoice)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.number}.pdf"'},
    )
