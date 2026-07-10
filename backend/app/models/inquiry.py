"""
Inquiry document model as stored in MongoDB.
Represents a bus inquiry/lead logged by the owner from a customer call.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field


class AcType(str, Enum):
    AC     = "AC"
    NON_AC = "Non AC"


class VehicleCategory(str, Enum):
    CAR      = "Car"
    MINI_BUS = "Mini Bus"
    BUS      = "Bus"


class InquiryStatus(str, Enum):
    OPEN      = "Open"
    CONVERTED = "Converted"
    LOST      = "Lost"


class InquiryInDB(BaseModel):
    """Full inquiry document as stored in MongoDB."""

    id: Optional[str] = Field(default=None, alias="_id")

    # ── Ownership ──────────────────────────────────────────────────────────────
    owner_id: str

    # ── Customer contact ──────────────────────────────────────────────────────
    customer_name: str
    customer_phone: Optional[str] = None

    # ── Trip details ──────────────────────────────────────────────────────────
    num_passengers: int                      # Total number of passengers
    journey_date: str                        # Date string e.g. "2026-08-15"
    return_date: Optional[str] = None        # Return date (if applicable)
    pickup_point: str                        # Pickup location name
    pickup_time: str                         # e.g. "08:00"
    drop_location: str                       # Drop location name
    return_time: Optional[str] = None        # Return pickup time
    total_duty_days: int                     # Number of duty days

    # ── Vehicle preferences ───────────────────────────────────────────────────
    ac_type: AcType = AcType.NON_AC
    vehicle_category: VehicleCategory = VehicleCategory.MINI_BUS

    # ── Notes ─────────────────────────────────────────────────────────────────
    notes: Optional[str] = None

    # ── Lead status ───────────────────────────────────────────────────────────
    status: InquiryStatus = InquiryStatus.OPEN

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "use_enum_values": True,
    }

    @classmethod
    def from_mongo(cls, doc: dict) -> "InquiryInDB":
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        if doc and "owner_id" in doc and isinstance(doc["owner_id"], ObjectId):
            doc["owner_id"] = str(doc["owner_id"])
        return cls(**doc)
