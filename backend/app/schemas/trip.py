"""
Pydantic schemas for Trip request/response bodies.
Aligned with actual MongoDB document structure.
"""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


# ──────────────────────────────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────────────────────────────

class TripCreateRequest(BaseModel):
    """Body for POST /api/trips/ — owner creates a new trip/booking."""
    vehicle_id: str
    trip_id: str                           # Unique trip identifier
    client_name: str
    client_phone: str                      # Used to send booking notification
    pickup_location: str
    drop_location: str
    reporting_time: datetime               # ISO 8601 datetime e.g. "2026-05-26T08:00:00"
    balance_amount: float = 0.0            # Balance the client owes for this trip
    notes: Optional[str] = None

    # Bus-specific (optional — leave blank for trucks)
    permit_number: Optional[str] = None
    passing_info: Optional[str] = None


class TripUpdateRequest(BaseModel):
    """Body for PUT /api/trips/{id} — all fields optional."""
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    pickup_location: Optional[str] = None
    drop_location: Optional[str] = None
    reporting_time: Optional[datetime] = None
    balance_amount: Optional[float] = None
    payment_status: Optional[str] = None   # "Pending" | "Partial" | "Paid"
    trip_status: Optional[str] = None      # "Scheduled" | "On Trip" | "Completed" | "Cancelled"
    notes: Optional[str] = None
    
    # ── Trip Metrics
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    distance_travelled_km: Optional[float] = None

    # Truck-specific (editable by admin)
    gr_number: Optional[str] = None
    eway_bill: Optional[str] = None

    # Bus-specific
    permit_number: Optional[str] = None
    passing_info: Optional[str] = None


class DutyLogEntryRequest(BaseModel):
    """Body for POST /api/trips/{id}/duty-log — append one log entry."""
    action: str                            # e.g. "Departed", "Reached Checkpoint"
    note: Optional[str] = None


class LocationUpdateRequest(BaseModel):
    """Body for PUT /api/trips/{id}/location — driver pushes GPS coords."""
    lat: float
    lng: float

class FreightDocsUpdateRequest(BaseModel):
    """Body for PUT /api/trips/{id}/freight-docs."""
    eway_bill: Optional[str] = None
    gr_number: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Response schema
# ──────────────────────────────────────────────────────────────────────────────

class TripResponse(BaseModel):
    """Safe trip representation returned to the client — mirrors actual MongoDB fields."""
    id: str
    trip_id: str
    vehicle_id: str
    vehicle_number: str
    vehicle_type: str
    driver_id: Optional[str] = None
    driver_name: str
    driver_phone: str
    client_name: str
    client_phone: str
    pickup_location: str
    drop_location: str
    reporting_time: datetime
    balance_amount: float = 0.0
    amount_paid: float = 0.0
    trip_cost: float = 0.0
    payment_link: Optional[str] = None
    payment_status: str
    trip_status: str
    notes: Optional[str] = None
    driver_msg_sent: bool
    client_msg_sent: bool
    created_at: datetime

    # ── Trip Metrics
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    distance_travelled_km: Optional[float] = None

    # Truck-specific
    gr_number: Optional[str] = None
    eway_bill: Optional[str] = None

    # Bus-specific
    permit_number: Optional[str] = None
    passing_info: Optional[str] = None

    # Duty log
    duty_log: list[Any] = []

    # Real-time GPS
    driver_lat: Optional[float] = None
    driver_lng: Optional[float] = None
    location_updated_at: Optional[datetime] = None

    # Invoice linkage
    is_invoiced: bool = False
    invoice_id: Optional[str] = None
    freight_charge: float = 0.0
    billing_type: str = "post_paid"
    proforma_invoice_id: Optional[str] = None
