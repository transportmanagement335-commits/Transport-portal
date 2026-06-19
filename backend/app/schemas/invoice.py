"""
Pydantic schemas for Invoice API request/response bodies.
"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


# ──────────────────────────────────────────────────────────────────────────────
# Line item schemas
# ──────────────────────────────────────────────────────────────────────────────

class InvoiceItemSchema(BaseModel):
    """A single line item in an invoice."""
    description: str
    quantity: float = 1.0
    unit: str = "fixed"     # trip | km | ton | hour | fixed
    rate: float = 0.0
    trip_id: Optional[str] = None

    @field_validator("quantity", "rate")
    @classmethod
    def must_be_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Quantity and rate must be >= 0")
        return v


# ──────────────────────────────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    """Body for POST /api/invoices — admin creates a new invoice."""
    invoice_type: str = "customer"      # "customer" | "vendor"
    invoice_stage: str = "final"        # "final" | "proforma" | "advance"
    recipient_id: str                   # customer or vendor ID
    items: list[InvoiceItemSchema]
    tax_rate: float = 0.0               # e.g. 18 means 18%
    discount: float = 0.0              # flat discount amount
    due_date: datetime
    notes: Optional[str] = None
    terms: str = "Payment due within 30 days"
    trip_ids: list[str] = []
    expense_ids: list[str] = []
    currency: str = "INR"

    @field_validator("items")
    @classmethod
    def at_least_one_item(cls, v: list) -> list:
        if len(v) < 1:
            raise ValueError("Invoice must have at least one line item")
        return v

    @field_validator("tax_rate", "discount")
    @classmethod
    def must_be_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Tax rate and discount must be >= 0")
        return v


class InvoiceUpdate(BaseModel):
    """Body for PUT /api/invoices/{id} — update draft invoices only."""
    items: Optional[list[InvoiceItemSchema]] = None
    tax_rate: Optional[float] = None
    discount: Optional[float] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    terms: Optional[str] = None


class PaymentRecordRequest(BaseModel):
    """Body for POST /api/invoices/{id}/payment."""
    amount: float
    method: str = "cash"    # cash | bank_transfer | upi | cheque
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Payment amount must be > 0")
        return v


# ──────────────────────────────────────────────────────────────────────────────
# Response schemas
# ──────────────────────────────────────────────────────────────────────────────

class InvoiceItemResponse(BaseModel):
    """Line item in invoice response."""
    description: str
    quantity: float
    unit: str
    rate: float
    amount: float
    trip_id: Optional[str] = None


class InvoiceResponse(BaseModel):
    """Full invoice representation returned to the client."""
    id: str
    invoice_number: str
    invoice_type: str
    invoice_stage: str = "final"
    issuer_id: str
    issuer_details: Optional[dict] = None
    recipient_id: Optional[str] = None
    recipient_details: Optional[dict] = None
    items: list[Any] = []
    subtotal: float
    tax_rate: float
    tax_amount: float
    discount: float
    total_amount: float
    currency: str
    status: str
    paid_amount: float
    payment_records: list[Any] = []
    issue_date: datetime
    due_date: datetime
    paid_date: Optional[datetime] = None
    trip_ids: list[str] = []
    expense_ids: list[str] = []
    notes: Optional[str] = None
    terms: str
    pdf_url: Optional[str] = None
    proforma_parent_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InvoiceStats(BaseModel):
    """Dashboard stats for the invoices page."""
    total_outstanding: float
    overdue_amount: float
    paid_this_month: float
    draft_count: int
    monthly_revenue: list = []   # [{month: "Jun 2026", total: 50000.0}, ...] last 6 months


class ConvertProformaRequest(BaseModel):
    """Body for POST /invoices/{id}/convert-proforma — optional adjustments."""
    items: Optional[list[InvoiceItemSchema]] = None
    tax_rate: Optional[float] = None
    discount: Optional[float] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
