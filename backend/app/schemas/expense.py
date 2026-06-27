from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class ExpenseCreateRequest(BaseModel):
    vehicle_id: str
    trip_id: Optional[str] = None
    category: str
    amount: float
    date: Optional[datetime] = None  # If none, we use current time
    notes: Optional[str] = None
    audio_note_url: Optional[str] = None
    receipt_url: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None

class ExpenseResponse(BaseModel):
    id: str
    vehicle_id: str
    trip_id: Optional[str] = None
    category: str
    amount: float
    date: datetime
    notes: Optional[str] = None
    audio_note_url: Optional[str] = None
    receipt_url: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    recorded_by: str
    created_at: datetime

class VerifyReceiptRequest(BaseModel):
    amount: float
    receipt_url: str

class VerifyReceiptResponse(BaseModel):
    match: bool
    extracted_amount: Optional[float] = None
