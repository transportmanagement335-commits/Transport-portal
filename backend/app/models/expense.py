from datetime import datetime
from enum import Enum
from typing import Optional
from bson import ObjectId
from pydantic import BaseModel, Field

class ExpenseCategory(str, Enum):
    FUEL = "Fuel"
    DRIVER_PAYMENT = "Driver Payment"
    TOLLS = "Tolls"
    PARKING = "Parking"
    SERVICE_REPAIR = "Service & Repair"
    MISC = "Miscellaneous"

class ExpenseInDB(BaseModel):
    """Represents an expense document in MongoDB."""
    id: Optional[str] = Field(default=None, alias="_id")
    owner_id: str
    vehicle_id: str
    trip_id: Optional[str] = None
    category: ExpenseCategory
    amount: float
    date: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None
    audio_note_url: Optional[str] = None
    recorded_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "use_enum_values": True,
    }

    @classmethod
    def from_mongo(cls, doc: dict) -> "ExpenseInDB":
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        for field in ("owner_id", "vehicle_id", "trip_id"):
            if doc and field in doc and isinstance(doc[field], ObjectId):
                doc[field] = str(doc[field])
        return cls(**doc)
