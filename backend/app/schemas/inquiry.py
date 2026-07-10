"""
Pydantic schemas for Inquiry API request/response bodies.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ──────────────────────────────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────────────────────────────

class InquiryCreate(BaseModel):
    """Body for POST /api/inquiries — owner logs a new bus inquiry."""
    customer_name: str
    customer_phone: Optional[str] = None
    num_passengers: int
    journey_date: str
    return_date: Optional[str] = None
    pickup_point: str
    pickup_time: str
    drop_location: str
    return_time: Optional[str] = None
    total_duty_days: int
    ac_type: str = "Non AC"
    vehicle_category: str = "Mini Bus"
    notes: Optional[str] = None


class InquiryUpdate(BaseModel):
    """Body for PUT /api/inquiries/{id} — all fields optional."""
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    num_passengers: Optional[int] = None
    journey_date: Optional[str] = None
    return_date: Optional[str] = None
    pickup_point: Optional[str] = None
    pickup_time: Optional[str] = None
    drop_location: Optional[str] = None
    return_time: Optional[str] = None
    total_duty_days: Optional[int] = None
    ac_type: Optional[str] = None
    vehicle_category: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Response schema
# ──────────────────────────────────────────────────────────────────────────────

class InquiryResponse(BaseModel):
    """Inquiry representation returned to the client."""
    id: str
    owner_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    num_passengers: int
    journey_date: str
    return_date: Optional[str] = None
    pickup_point: str
    pickup_time: str
    drop_location: str
    return_time: Optional[str] = None
    total_duty_days: int
    ac_type: str
    vehicle_category: str
    notes: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
