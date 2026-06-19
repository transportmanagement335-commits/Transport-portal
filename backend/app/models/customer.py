"""
Customer document model — represents a client of the transport company.
Stored in the 'customers' collection in MongoDB.
"""
from datetime import datetime
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field


class CustomerInDB(BaseModel):
    """
    Represents the full customer document as stored in MongoDB.
    Each customer belongs to one owner (transport company) via owner_id.
    """
    id: Optional[str] = Field(default=None, alias="_id")

    # ── Ownership (multi-tenancy) ──────────────────────────────────────────────
    owner_id: str                           # ObjectId of the owning admin/owner

    # ── Customer details ───────────────────────────────────────────────────────
    name: str                               # Company or individual name (required)
    contact_person: Optional[str] = None   # Primary point of contact
    email: Optional[str] = None            # Billing email
    phone: Optional[str] = None            # Contact phone number
    address: Optional[str] = None          # Billing address
    gst_number: Optional[str] = None       # GST registration number (optional)

    # ── Financial terms ────────────────────────────────────────────────────────
    payment_terms_days: int = 30           # Default payment due in 30 days

    # ── Status ─────────────────────────────────────────────────────────────────
    is_active: bool = True

    # ── Timestamps ─────────────────────────────────────────────────────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }

    @classmethod
    def from_mongo(cls, doc: dict) -> "CustomerInDB":
        """Convert raw MongoDB document (with ObjectId) to this model."""
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        if doc and "owner_id" in doc and isinstance(doc["owner_id"], ObjectId):
            doc["owner_id"] = str(doc["owner_id"])
        return cls(**doc)
