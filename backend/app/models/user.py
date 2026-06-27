"""
User document model representing a document as stored in MongoDB.
Both Owners and Drivers are stored in the same 'users' collection.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    OWNER = "owner"
    DRIVER = "driver"


class UserInDB(BaseModel):
    """
    Represents the full user document as stored in MongoDB.
    Used internally — never returned directly to the client.
    """
    id: Optional[str] = Field(default=None, alias="_id")
    name: str
    email: EmailStr
    phone: str
    password_hash: str
    role: UserRole
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # ── Owner-only fields ──────────────────────────────────────────────────────
    company_name: Optional[str] = None      # Required for owners
    gst_number: Optional[str] = None        # Optional GST/tax number
    service_type: Optional[str] = None      # Service type (e.g., Tankers, Busses, Trucks)

    # ── Driver-only fields ─────────────────────────────────────────────────────
    owner_id: Optional[str] = None          # ObjectId of the owning owner (required for drivers)
    assigned_truck_id: Optional[str] = None # ObjectId of the currently assigned truck
    license_number: Optional[str] = None    # Driver's license number
    license_image_url: Optional[str] = None
    license_expiry: Optional[datetime] = None

    # ── OTP fields ─────────────────────────────────────────────────────────────
    otp_code: Optional[str] = None
    otp_expires_at: Optional[datetime] = None

    model_config = {
        "populate_by_name": True,           # Allow both 'id' and '_id'
        "arbitrary_types_allowed": True,
    }

    @classmethod
    def from_mongo(cls, doc: dict) -> "UserInDB":
        """Convert raw MongoDB document (with ObjectId) to this model."""
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        if doc and "owner_id" in doc and isinstance(doc["owner_id"], ObjectId):
            doc["owner_id"] = str(doc["owner_id"])
        if doc and "assigned_truck_id" in doc and isinstance(doc["assigned_truck_id"], ObjectId):
            doc["assigned_truck_id"] = str(doc["assigned_truck_id"])
        return cls(**doc)
