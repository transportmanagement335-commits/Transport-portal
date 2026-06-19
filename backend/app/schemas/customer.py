"""
Pydantic schemas for Customer API request/response bodies.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


# ──────────────────────────────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────────────────────────────

class CustomerCreate(BaseModel):
    """Body for POST /api/customers — owner creates a new customer/client."""
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    payment_terms_days: int = 30


class CustomerUpdate(BaseModel):
    """Body for PUT /api/customers/{id} — all fields are optional."""
    name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    payment_terms_days: Optional[int] = None
    is_active: Optional[bool] = None


# ──────────────────────────────────────────────────────────────────────────────
# Response schema
# ──────────────────────────────────────────────────────────────────────────────

class CustomerResponse(BaseModel):
    """Safe customer representation returned to the client."""
    id: str
    owner_id: str
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    payment_terms_days: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
