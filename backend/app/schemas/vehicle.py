"""
Pydantic schemas for vehicle request/response bodies.
These define what the API accepts and returns — not the DB models.
"""
from typing import Optional
from pydantic import BaseModel


# ──────────────────────────────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────────────────────────────

class VehicleCreateRequest(BaseModel):
    """Body for POST /api/vehicles"""
    number: str
    type: str
    model: str
    driver: str
    driver_id: Optional[str] = None
    insurance: Optional[str] = None     # Date string "YYYY-MM-DD"
    permit: Optional[str] = None
    fitness: Optional[str] = None
    puc: Optional[str] = None
    status: str = "Active"              # "Active" | "Booked" | "Maintenance"
    location: Optional[str] = None
    truck_size: Optional[str] = None
    body_type: Optional[str] = None
    truck_category: Optional[str] = None
    bus_type: Optional[str] = None
    bus_category: Optional[str] = None
    bus_layout: Optional[str] = None
    seating_capacity: Optional[str] = None
    amenities: list[str] = []
    is_ac: Optional[bool] = None


class VehicleUpdateRequest(BaseModel):
    """Body for PUT /api/vehicles/{id} — all fields optional"""
    number: Optional[str] = None
    type: Optional[str] = None
    model: Optional[str] = None
    driver: Optional[str] = None
    driver_id: Optional[str] = None
    insurance: Optional[str] = None
    permit: Optional[str] = None
    fitness: Optional[str] = None
    puc: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    truck_size: Optional[str] = None
    body_type: Optional[str] = None
    truck_category: Optional[str] = None
    bus_type: Optional[str] = None
    bus_category: Optional[str] = None
    bus_layout: Optional[str] = None
    seating_capacity: Optional[str] = None
    amenities: Optional[list[str]] = None
    is_ac: Optional[bool] = None

# ──────────────────────────────────────────────────────────────────────────────
# Response schemas
# ──────────────────────────────────────────────────────────────────────────────

class VehicleResponse(BaseModel):
    """Safe vehicle representation returned to the client."""
    id: str
    number: str
    type: str
    model: str
    driver: str
    driver_id: Optional[str] = None
    insurance: Optional[str] = None
    permit: Optional[str] = None
    fitness: Optional[str] = None
    puc: Optional[str] = None
    status: str
    location: Optional[str] = None
    truck_size: Optional[str] = None
    body_type: Optional[str] = None
    truck_category: Optional[str] = None
    bus_type: Optional[str] = None
    bus_category: Optional[str] = None
    bus_layout: Optional[str] = None
    seating_capacity: Optional[str] = None
    amenities: list[str] = []
    is_ac: Optional[bool] = None


# ──────────────────────────────────────────────────────────────────────────────
# Admin stats / activity schemas
# ──────────────────────────────────────────────────────────────────────────────

class DocumentExpiryAlert(BaseModel):
    """Details of a vehicle document that is expired or expiring soon."""
    vehicle_number: str
    doc_type: str        # "Insurance", "Permit", "Fitness", "PUC"
    expiry_date: str     # YYYY-MM-DD
    days_left: int
    status: str          # "Expired" | "Expiring Soon"


class PaymentSummary(BaseModel):
    """Pending and overdue payments overview."""
    pending_amount: float
    overdue_amount: float
    pending_count: int
    overdue_count: int


class UpcomingDuty(BaseModel):
    """A driver's scheduled/active duty route."""
    driver_name: str
    vehicle_number: str
    route: str
    status: str          # "On Trip" | "Ready" | "Suspended (Maintenance)"


class AdminStatsResponse(BaseModel):
    """Response for GET /api/admin/stats with enriched dashboard metrics."""
    total_vehicles: int
    active_drivers: int
    trips_today: int
    pending_documents: int
    available_vehicles: int
    booked_vehicles: int
    maintenance_vehicles: int
    type_distribution: dict[str, int]
    document_expiry_alerts: list[DocumentExpiryAlert]
    payments: PaymentSummary
    upcoming_duties: list[UpcomingDuty]
    total_profit: float = 0.0


class RecentActivityRow(BaseModel):
    """Single row in the recent vehicle activity table."""
    vehicle: str        # Registration number
    driver: str
    status: str
    location: Optional[str] = None


class RecentActivityResponse(BaseModel):
    """Response for GET /api/admin/recent-activity"""
    activities: list[RecentActivityRow]


# ──────────────────────────────────────────────────────────────────────────────
# Driver stats schema
# ──────────────────────────────────────────────────────────────────────────────

class DriverStatsResponse(BaseModel):
    """Response for GET /api/driver/stats"""
    assigned_trips: int
    completed_trips: int
    vehicle_status: str     # Status of the driver's assigned vehicle


class CurrentTripResponse(BaseModel):
    """Response for GET /api/driver/current-trip — full trip data for the driver map."""
    # Trip identifiers
    id: Optional[str] = None
    trip_id: Optional[str] = None

    # Vehicle info
    vehicle: Optional[str] = None           # Vehicle number
    vehicle_id: Optional[str] = None
    vehicle_type: Optional[str] = None

    # Route
    pickup_location: Optional[str] = None
    drop_location: Optional[str] = None
    reporting_time: Optional[str] = None

    # Status
    status: Optional[str] = None            # "Scheduled" | "On Trip" | "Completed" | "Cancelled"
    started_at: Optional[str] = None        # ISO timestamp

    # Client
    client_name: Optional[str] = None
    client_phone: Optional[str] = None

    # GPS (driver's current position stored in DB)
    driver_lat: Optional[float] = None
    driver_lng: Optional[float] = None

    # Notes
    notes: Optional[str] = None
