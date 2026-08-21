"""
Vehicle document model as stored in MongoDB.
Fields mirror the frontend Vehicles.jsx data shape exactly.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field


class VehicleStatus(str, Enum):
    ACTIVE = "Active"
    BOOKED = "Booked"
    MAINTENANCE = "Maintenance"


class VehicleInDB(BaseModel):
    """Represents the full vehicle document as stored in MongoDB."""
    id: Optional[str] = Field(default=None, alias="_id")
    owner_id: str                           # ObjectId of the admin/owner who added it
    number: str                             # Registration plate e.g. "MH12AB1234"
    type: str                               # e.g. "49-Seater AC", "Truck", "40-Seater"
    model: str                              # e.g. "Volvo 9600"
    driver: str                             # Assigned driver name
    driver_id: Optional[str] = None         # ObjectId of assigned driver user (optional link)
    insurance: Optional[str] = None         # Insurance expiry date string e.g. "2026-07-15"
    permit: Optional[str] = None            # Permit expiry date string
    fitness: Optional[str] = None           # Fitness cert expiry date string
    puc: Optional[str] = None               # PUC expiry date string
    status: VehicleStatus = VehicleStatus.ACTIVE
    location: Optional[str] = None          # Current city / location
    truck_size: Optional[str] = None
    body_type: Optional[str] = None
    truck_category: Optional[str] = None
    bus_type: Optional[str] = None
    bus_category: Optional[str] = None
    bus_layout: Optional[str] = None
    seating_capacity: Optional[str] = None
    amenities: list[str] = Field(default_factory=list)
    is_ac: Optional[bool] = None
    current_km: int = 0
    engine_no: Optional[str] = None
    chassis_no: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "use_enum_values": True,
    }

    @classmethod
    def from_mongo(cls, doc: dict) -> "VehicleInDB":
        """Convert raw MongoDB document (with ObjectId) to this model."""
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        if doc and "owner_id" in doc and isinstance(doc["owner_id"], ObjectId):
            doc["owner_id"] = str(doc["owner_id"])
        if doc and "driver_id" in doc and isinstance(doc["driver_id"], ObjectId):
            doc["driver_id"] = str(doc["driver_id"])
        return cls(**doc)
