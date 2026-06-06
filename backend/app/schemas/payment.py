from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class PaymentCreateRequest(BaseModel):
    trip_id: str
    amount_paid: float
    method: str
    trip_cost: Optional[float] = 0.0
    transaction_id: Optional[str] = None

class PaymentResponse(BaseModel):
    id: str
    trip_id: str
    client_name: str
    vehicle_number: str
    amount: float
    method: str
    transaction_id: Optional[str] = None
    created_at: datetime
