"""
Invoice document model — represents a billing invoice issued by the transport
company to a client, or a vendor expense invoice received from a supplier.
Stored in the 'invoices' collection in MongoDB.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field


class InvoiceType(str, Enum):
    CUSTOMER = "customer"   # Transport company → client
    VENDOR   = "vendor"     # Supplier → transport company


class InvoiceStage(str, Enum):
    FINAL    = "final"      # Billable tax invoice
    PROFORMA = "proforma"   # Pre-trip estimate / PO approval
    ADVANCE  = "advance"    # Advance payment invoice


class InvoiceStatus(str, Enum):
    DRAFT      = "draft"
    SENT       = "sent"
    VIEWED     = "viewed"
    PAID       = "paid"
    PARTIAL    = "partial"
    OVERDUE    = "overdue"
    CANCELLED  = "cancelled"


class InvoiceItemInDB(BaseModel):
    """A single line item within an invoice."""
    description: str
    quantity: float = 1.0
    unit: str = "fixed"         # trip | km | ton | hour | fixed
    rate: float = 0.0
    amount: float = 0.0         # quantity × rate, rounded to 2 decimals
    trip_id: Optional[str] = None   # Optional link back to a Trip document


class PartySnapshot(BaseModel):
    """Immutable snapshot of a party's details at invoice creation time."""
    name: str
    address: Optional[str] = None
    gst: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class PaymentRecord(BaseModel):
    """A single payment entry recorded against this invoice."""
    amount: float
    method: str = "cash"        # cash | bank_transfer | upi | cheque
    notes: Optional[str] = None
    recorded_at: datetime = Field(default_factory=datetime.utcnow)


class InvoiceInDB(BaseModel):
    """Represents the full invoice document as stored in MongoDB."""

    id: Optional[str] = Field(default=None, alias="_id")

    # ── Invoice identity ────────────────────────────────────────────────────────
    invoice_number: str                     # e.g. "INV-2026-0001"
    invoice_type: InvoiceType = InvoiceType.CUSTOMER
    invoice_stage: InvoiceStage = InvoiceStage.FINAL  # final | proforma | advance

    # ── Ownership (multi-tenancy) ───────────────────────────────────────────────
    issuer_id: str                          # owner_id of the transport company
    issuer_details: Optional[dict] = None  # PartySnapshot of the issuer

    # ── Recipient ──────────────────────────────────────────────────────────────
    recipient_id: Optional[str] = None     # customer / vendor ObjectId
    recipient_details: Optional[dict] = None  # PartySnapshot of the recipient

    # ── Line items ─────────────────────────────────────────────────────────────
    items: list = Field(default_factory=list)   # list[InvoiceItemInDB]

    # ── Financials (all server-side calculated, rounded to 2 decimals) ─────────
    subtotal: float = 0.0
    tax_rate: float = 0.0                   # e.g. 18 means 18%
    tax_amount: float = 0.0
    discount: float = 0.0                  # flat discount amount
    total_amount: float = 0.0
    currency: str = "INR"

    # ── Payment tracking ───────────────────────────────────────────────────────
    status: InvoiceStatus = InvoiceStatus.DRAFT
    paid_amount: float = 0.0
    payment_records: list = Field(default_factory=list)  # list[PaymentRecord]

    # ── Dates ──────────────────────────────────────────────────────────────────
    issue_date: datetime = Field(default_factory=datetime.utcnow)
    due_date: datetime                      # Required — must be >= issue_date
    paid_date: Optional[datetime] = None   # Set when fully paid

    # ── Linked documents ───────────────────────────────────────────────────────
    trip_ids: list = Field(default_factory=list)      # list[str]
    expense_ids: list = Field(default_factory=list)   # list[str] (vendor invoices)

    # ── Metadata ───────────────────────────────────────────────────────────────
    notes: Optional[str] = None
    terms: str = "Payment due within 30 days"
    pdf_url: Optional[str] = None          # Relative path to generated PDF
    proforma_parent_id: Optional[str] = None  # Set when converted from a proforma
    created_by: Optional[str] = None       # admin user ID

    # ── Timestamps ─────────────────────────────────────────────────────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "use_enum_values": True,
    }

    @classmethod
    def from_mongo(cls, doc: dict) -> "InvoiceInDB":
        """Convert raw MongoDB document (with ObjectId) to this model."""
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        for field in ("issuer_id", "recipient_id", "created_by"):
            if doc and field in doc and isinstance(doc[field], ObjectId):
                doc[field] = str(doc[field])
        return cls(**doc)
