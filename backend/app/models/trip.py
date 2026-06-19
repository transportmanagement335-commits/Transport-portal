"""
Trip document model as stored in MongoDB.
Represents a booking/job assigned by an Owner to a Driver + Vehicle for a Client.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field


class TripStatus(str, Enum):
    SCHEDULED  = "Scheduled"
    ON_TRIP    = "On Trip"
    COMPLETED  = "Completed"
    CANCELLED  = "Cancelled"


class PaymentStatus(str, Enum):
    PENDING = "Pending"
    PAID    = "Paid"


class TripInDB(BaseModel):
    """Represents the full trip document as stored in MongoDB."""

    id: Optional[str] = Field(default=None, alias="_id")

    # ── Ownership ──────────────────────────────────────────────────────────────
    owner_id: str                           # ObjectId of the admin/owner

    # ── Vehicle & Driver (cached at trip-creation time) ────────────────────────
    vehicle_id: str                         # ObjectId of the assigned vehicle
    vehicle_number: str                     # e.g. "MH12AB1234"
    vehicle_type: str                       # e.g. "49-Seater AC"
    driver_id: Optional[str] = None         # ObjectId of the assigned driver user
    driver_name: str                        # Cached driver name
    driver_phone: str                       # Driver phone — used for SMS reminders

    # ── Client details ─────────────────────────────────────────────────────────
    client_name: str
    client_phone: str                       # Client phone — used for booking SMS

    # ── Trip details ───────────────────────────────────────────────────────────
    pickup_location: str
    drop_location: str
    reporting_time: datetime               # When driver must report
    notes: Optional[str] = None

    # ── Truck-specific (auto-generated on creation) ─────────────────────────────
    gr_number: Optional[str] = None        # Goods Receipt number e.g. "GR-20260601-4821"
    eway_bill: Optional[str] = None        # E-way bill number e.g. "EWB-1748765432"

    # ── Bus-specific (manual entry) ────────────────────────────────────────────
    permit_number: Optional[str] = None    # Bus permit number
    passing_info: Optional[str] = None     # Checkpoint / passing info

    # ── Duty log (append-only timeline) ────────────────────────────────────────
    duty_log: list = Field(default_factory=list)  # [{timestamp, action, note, logged_by}]

    # ── Real-time GPS (pushed every ~1s by driver) ──────────────────────────────
    driver_lat: Optional[float] = None     # Current latitude
    driver_lng: Optional[float] = None     # Current longitude
    location_updated_at: Optional[datetime] = None  # Last GPS push timestamp

    # ── Payment ────────────────────────────────────────────────────────────────
    trip_cost: float = 0.0
    amount_paid: float = 0.0
    payment_link: Optional[str] = None     # Dummy Razorpay link
    payment_status: PaymentStatus = PaymentStatus.PENDING

    # ── Invoice linkage ────────────────────────────────────────────────────────
    freight_charge: float = 0.0            # Agreed transport fee for this trip
    billing_type: str = "post_paid"        # "post_paid" | "pre_paid" | "proforma"
    is_invoiced: bool = False              # True once an invoice has been generated
    invoice_id: Optional[str] = None      # ObjectId of the linked final invoice
    proforma_invoice_id: Optional[str] = None  # ObjectId of linked proforma invoice

    # ── Status ─────────────────────────────────────────────────────────────────
    trip_status: TripStatus = TripStatus.SCHEDULED

    # ── Message tracking ───────────────────────────────────────────────────────
    driver_msg_sent: bool = False
    client_msg_sent: bool = False

    # ── Trip Metrics ───────────────────────────────────────────────────────────
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    distance_travelled_km: Optional[float] = None

    # ── Timestamps ─────────────────────────────────────────────────────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "use_enum_values": True,
    }

    @classmethod
    def from_mongo(cls, doc: dict) -> "TripInDB":
        """Convert raw MongoDB document (with ObjectId) to this model."""
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        for field in ("owner_id", "vehicle_id", "driver_id"):
            if doc and field in doc and isinstance(doc[field], ObjectId):
                doc[field] = str(doc[field])
        return cls(**doc)
