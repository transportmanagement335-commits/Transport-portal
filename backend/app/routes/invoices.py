"""
Invoices routes — full CRUD, send, payment recording, PDF generation.

Route summary:
  GET  /api/invoices/stats              → Dashboard stats
  GET  /api/invoices/overdue            → All overdue invoices
  POST /api/invoices/from-trip/{id}     → Auto-generate from a completed trip
  POST /api/invoices/                   → Create invoice (owner only)
  GET  /api/invoices/                   → List invoices (filterable)
  GET  /api/invoices/{id}               → Full invoice details
  PUT  /api/invoices/{id}               → Update draft invoice only
  POST /api/invoices/{id}/send          → Generate PDF + email customer
  POST /api/invoices/{id}/payment       → Record a payment
  DELETE /api/invoices/{id}             → Delete draft invoice only

Important: /stats, /overdue, /from-trip/* MUST be registered before /{id}
to avoid FastAPI treating "stats"/"overdue" as an {id} path parameter.
"""
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import get_database
from app.routes.auth import require_owner
from app.schemas.invoice import (
    ConvertProformaRequest,
    InvoiceCreate,
    InvoiceResponse,
    InvoiceStats,
    InvoiceUpdate,
    PaymentRecordRequest,
)
from app.services import invoice_service
from app.services.pdf_service import generate_invoice_pdf
from app.services.email_service import send_invoice_email
from app.services.whatsapp_service import send_invoice_whatsapp
from app.config import settings

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# Stats (registered FIRST — before /{invoice_id})
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/stats",
    response_model=InvoiceStats,
    summary="Invoice dashboard stats",
)
async def get_invoice_stats(current_owner=Depends(require_owner)):
    """Return aggregated stats: outstanding, overdue, paid this month, draft count."""
    db = get_database()
    return await invoice_service.get_stats(current_owner.id, db)


# ──────────────────────────────────────────────────────────────────────────────
# Overdue invoices (registered BEFORE /{invoice_id})
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/overdue",
    response_model=list[InvoiceResponse],
    summary="Get all overdue invoices",
)
async def get_overdue(current_owner=Depends(require_owner)):
    """Return invoices past their due date that are not paid or cancelled."""
    db = get_database()
    return await invoice_service.get_overdue_invoices(current_owner.id, db)


# ──────────────────────────────────────────────────────────────────────────────
# Auto-generate from trip (registered BEFORE /{invoice_id})
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/from-trip/{trip_id}",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Auto-generate a draft invoice from a completed trip",
)
async def generate_from_trip(
    trip_id: str,
    current_owner=Depends(require_owner),
):
    """
    Generates a pre-filled draft invoice from a completed, uninvoiced trip.
    Marks the trip as is_invoiced = True.
    """
    db = get_database()
    try:
        return await invoice_service.auto_generate_from_trip(
            trip_id=trip_id,
            owner_id=current_owner.id,
            admin_id=current_owner.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# Send via WhatsApp (PDF + text message)
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/send-whatsapp/{invoice_id}",
    summary="Generate PDF + send invoice to customer via WhatsApp Business API",
)
async def send_invoice_via_whatsapp(
    invoice_id: str,
    current_owner=Depends(require_owner),
):
    """
    1. Generate PDF via ReportLab
    2. Save to uploads/invoices/{owner_id}/{invoice_number}.pdf
    3. Build public download URL using APP_BASE_URL
    4. Update invoice: pdf_url + status = 'sent'
    5. Send WhatsApp text + document message to customer's phone
    Returns: { message, pdf_url, recipient_phone }
    """
    db = get_database()
    invoice = await invoice_service.get_invoice_by_id(invoice_id, current_owner.id, db)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # 1. Generate PDF
    try:
        file_path = generate_invoice_pdf(invoice)
        pdf_relative_url = "/" + file_path.replace("\\\\", "/").replace("\\", "/")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF generation failed: {exc}",
        )

    # 2. Build public URL
    base_url = settings.APP_BASE_URL.rstrip("/")
    pdf_public_url = f"{base_url}{pdf_relative_url}"

    # 3. Mark as sent + store pdf_url
    updated = await invoice_service.mark_as_sent(invoice_id, current_owner.id, pdf_relative_url, db)
    if not updated:
        raise HTTPException(status_code=404, detail="Invoice not found after update")

    # 4. Build due_date string
    raw_due = invoice.get("due_date", "")
    if hasattr(raw_due, "strftime"):
        due_date_str = raw_due.strftime("%d %b %Y")
    else:
        try:
            from datetime import datetime as dt
            due_date_str = dt.fromisoformat(str(raw_due).replace("Z", "")).strftime("%d %b %Y")
        except Exception:
            due_date_str = str(raw_due)

    # 5. Send WhatsApp message (non-fatal)
    recipient = invoice.get("recipient_details") or {}
    to_phone = recipient.get("phone", "")
    issuer_name = (invoice.get("issuer_details") or {}).get("name", "Transport Company")

    wa_sent = False
    if to_phone:
        wa_sent = await send_invoice_whatsapp(
            to_phone=to_phone,
            invoice_number=invoice.get("invoice_number", ""),
            total_amount=invoice.get("total_amount", 0),
            due_date=due_date_str,
            pdf_url=pdf_public_url,
            company_name=issuer_name,
            currency=invoice.get("currency", "INR"),
        )

    return {
        "message": "Invoice PDF generated and sent via WhatsApp" if wa_sent else "PDF generated (WhatsApp not configured or no phone number)",
        "pdf_url": pdf_relative_url,
        "recipient_phone": to_phone or None,
        "whatsapp_sent": wa_sent,
        "invoice": updated,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Convert proforma → final invoice
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/convert-proforma/{invoice_id}",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Convert a proforma/advance invoice to a final billable invoice",
)
async def convert_proforma(
    invoice_id: str,
    data: ConvertProformaRequest,
    current_owner=Depends(require_owner),
):
    """
    Creates a new final invoice cloned from the proforma.
    Assigns a new sequential invoice number.
    Original proforma remains unchanged.
    Linked trips are marked as is_invoiced = True.
    """
    db = get_database()
    try:
        return await invoice_service.convert_proforma_to_final(
            proforma_id=invoice_id,
            owner_id=current_owner.id,
            admin_id=current_owner.id,
            adjustments=data.model_dump(exclude_none=True),
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# Create invoice
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new invoice",
)
async def create_invoice(
    data: InvoiceCreate,
    current_owner=Depends(require_owner),
):
    """
    Owner-only. All totals are calculated server-side — frontend totals are ignored.
    At least one line item is required.
    """
    db = get_database()
    try:
        return await invoice_service.create_invoice(
            owner_id=current_owner.id,
            admin_id=current_owner.id,
            data=data,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# List invoices
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[InvoiceResponse],
    summary="List invoices with optional filters",
)
async def list_invoices(
    current_owner=Depends(require_owner),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
):
    """List all invoices for the owner. Supports ?status=, ?customer_id=, date ranges."""
    db = get_database()
    return await invoice_service.get_all_invoices(
        owner_id=current_owner.id,
        db=db,
        status=status_filter,
        customer_id=customer_id,
        start_date=start_date,
        end_date=end_date,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Get single invoice
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{invoice_id}",
    response_model=InvoiceResponse,
    summary="Get full invoice details",
)
async def get_invoice(
    invoice_id: str,
    current_owner=Depends(require_owner),
):
    db = get_database()
    invoice = await invoice_service.get_invoice_by_id(invoice_id, current_owner.id, db)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


# ──────────────────────────────────────────────────────────────────────────────
# Update draft invoice
# ──────────────────────────────────────────────────────────────────────────────

@router.put(
    "/{invoice_id}",
    response_model=InvoiceResponse,
    summary="Update a draft invoice (recalculates totals)",
)
async def update_invoice(
    invoice_id: str,
    data: InvoiceUpdate,
    current_owner=Depends(require_owner),
):
    """Only draft invoices can be edited. Totals are recalculated server-side."""
    db = get_database()
    try:
        invoice = await invoice_service.update_invoice(invoice_id, current_owner.id, data, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


# ──────────────────────────────────────────────────────────────────────────────
# Send invoice (PDF + email)
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{invoice_id}/send",
    response_model=InvoiceResponse,
    summary="Generate PDF, update status to sent, email the customer",
)
async def send_invoice(
    invoice_id: str,
    current_owner=Depends(require_owner),
):
    """
    1. Generate PDF using ReportLab
    2. Save to uploads/invoices/{owner_id}/{invoice_number}.pdf
    3. Store pdf_url on invoice document
    4. Set status to 'sent'
    5. Email the customer (non-fatal if SMTP not configured)
    """
    db = get_database()
    invoice = await invoice_service.get_invoice_by_id(invoice_id, current_owner.id, db)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Generate PDF
    try:
        file_path = generate_invoice_pdf(invoice)
        # Convert to URL path: uploads/invoices/... → /uploads/invoices/...
        pdf_url = "/" + file_path.replace("\\", "/")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF generation failed: {str(e)}",
        )

    # Update invoice to sent + store pdf_url
    updated = await invoice_service.mark_as_sent(invoice_id, current_owner.id, pdf_url, db)
    if not updated:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Send email (best-effort — non-fatal)
    recipient = invoice.get("recipient_details") or {}
    to_email = recipient.get("email")
    if to_email:
        due_date_str = invoice.get("due_date", "")
        if isinstance(due_date_str, str):
            try:
                from datetime import datetime as dt
                parsed = dt.fromisoformat(due_date_str.replace("Z", ""))
                due_date_str = parsed.strftime("%d %b %Y")
            except Exception:
                pass

        server_url = os.getenv("SERVER_URL", "http://localhost:8000")
        pdf_download_url = f"{server_url}{pdf_url}" if pdf_url else None

        await send_invoice_email(
            to_email=to_email,
            invoice_number=invoice.get("invoice_number", ""),
            recipient_name=recipient.get("name", "Customer"),
            total_amount=invoice.get("total_amount", 0),
            due_date=due_date_str,
            currency=invoice.get("currency", "INR"),
            issuer_name=(invoice.get("issuer_details") or {}).get("name", "Transport Company"),
            pdf_download_url=pdf_download_url,
        )

    return updated


# ──────────────────────────────────────────────────────────────────────────────
# Record payment
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{invoice_id}/payment",
    response_model=InvoiceResponse,
    summary="Record a payment (partial or full)",
)
async def record_payment(
    invoice_id: str,
    data: PaymentRecordRequest,
    current_owner=Depends(require_owner),
):
    """
    Record a payment against the invoice.
    Status becomes 'paid' if fully settled, 'partial' otherwise.
    """
    db = get_database()
    try:
        updated = await invoice_service.record_payment(invoice_id, current_owner.id, data, db)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return updated


# ──────────────────────────────────────────────────────────────────────────────
# Delete invoice (draft only)
# ──────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/{invoice_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a draft invoice",
)
async def delete_invoice(
    invoice_id: str,
    current_owner=Depends(require_owner),
):
    """Only draft invoices can be deleted."""
    db = get_database()
    try:
        deleted = await invoice_service.delete_invoice(invoice_id, current_owner.id, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"message": "Invoice deleted successfully"}
