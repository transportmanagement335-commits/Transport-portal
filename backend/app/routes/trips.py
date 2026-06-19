"""
Trips routes — CRUD endpoints for managing trips/bookings.

Route summary:
  GET  /api/trips              → List all trips
  POST /api/trips              → Create a new trip (triggers messaging)
  GET  /api/trips/{id}         → Get a single trip
  PUT  /api/trips/{id}         → Update a trip
  DELETE /api/trips/all        → Delete all trips (cleanup)

  POST /api/trips/{id}/duty-log  → Append duty log entry
  PUT  /api/trips/{id}/location  → Driver pushes GPS coordinates (HTTP)
  WS   /ws/trips/{id}/location   → Admin watches live GPS (WebSocket)
"""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status

from app.database import get_database
from app.routes.auth import get_current_user, require_owner
from app.schemas.trip import (
    TripCreateRequest,
    TripResponse,
    TripUpdateRequest,
    DutyLogEntryRequest,
    LocationUpdateRequest,
    FreightDocsUpdateRequest,
)
from app.services import trip_service
from app.services.websocket_manager import ws_manager

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# List all trips
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[TripResponse],
    summary="List all trips",
)
async def list_trips(current_owner=Depends(require_owner)):
    """List all trips for the authenticated owner."""
    db = get_database()
    return await trip_service.get_all_trips(current_owner.id, db)


# ──────────────────────────────────────────────────────────────────────────────
# Create a trip
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/",
    response_model=TripResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new trip",
)
async def create_trip(
    data: TripCreateRequest,
    current_owner=Depends(require_owner),
):
    """
    Creates a new trip.
    - E-way bill and GR number default to null.
    - Triggers Twilio SMS to driver and client
    - Generates payment link
    - Schedules duty reminders
    """
    db = get_database()
    try:
        return await trip_service.create_trip(data, current_owner.id, db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ──────────────────────────────────────────────────────────────────────────────
# Get single trip
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{trip_id}",
    response_model=TripResponse,
    summary="Get single trip",
)
async def get_trip(
    trip_id: str,
    current_owner=Depends(require_owner),
):
    """Get single trip details."""
    db = get_database()
    trip = await trip_service.get_trip_by_id(trip_id, current_owner.id, db)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


# ──────────────────────────────────────────────────────────────────────────────
# Update a trip
# ──────────────────────────────────────────────────────────────────────────────

@router.put(
    "/{trip_id}",
    response_model=TripResponse,
    summary="Update a trip",
)
async def update_trip(
    trip_id: str,
    data: TripUpdateRequest,
    current_owner=Depends(require_owner),
):
    """Update trip details. Admin can edit any field anytime."""
    db = get_database()
    trip = await trip_service.update_trip(trip_id, data, current_owner.id, db)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


# ──────────────────────────────────────────────────────────────────────────────
# Delete all trips (cleanup)
# ──────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/all",
    summary="Delete all trips (cleanup)",
)
async def delete_all_trips(current_owner=Depends(require_owner)):
    """Delete all trips for the owner. Used for testing/cleanup."""
    db = get_database()
    deleted_count = await trip_service.delete_all_trips(current_owner.id, db)
    return {"message": f"Deleted {deleted_count} trips"}


# ──────────────────────────────────────────────────────────────────────────────
# Update Freight Docs
# ──────────────────────────────────────────────────────────────────────────────

@router.put(
    "/{trip_id}/freight-docs",
    response_model=TripResponse,
    summary="Update freight documentation",
)
async def update_freight_docs(
    trip_id: str,
    data: FreightDocsUpdateRequest,
    current_owner=Depends(require_owner),
):
    """Update E-way Bill and GR Number. Validates formats before saving."""
    db = get_database()
    try:
        trip = await trip_service.update_freight_docs(
            trip_id=trip_id,
            eway_bill=data.eway_bill,
            gr_number=data.gr_number,
            owner_id=current_owner.id,
            db=db
        )
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        return trip
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# Duty log — append entry
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{trip_id}/duty-log",
    response_model=TripResponse,
    summary="Append a duty log entry",
)
async def add_duty_log(
    trip_id: str,
    data: DutyLogEntryRequest,
    current_user=Depends(get_current_user),
):
    """
    Append a duty log entry to the trip.
    Both owner and assigned driver can call this.
    """
    db = get_database()
    trip = await trip_service.add_duty_log_entry(
        trip_id=trip_id,
        action=data.action,
        note=data.note,
        logged_by=current_user.name or current_user.email,
        db=db,
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


# ──────────────────────────────────────────────────────────────────────────────
# GPS location — driver HTTP push (every ~1 second)
# ──────────────────────────────────────────────────────────────────────────────

@router.put(
    "/{trip_id}/location",
    summary="Driver pushes current GPS coordinates",
)
async def update_location(
    trip_id: str,
    data: LocationUpdateRequest,
    current_user=Depends(get_current_user),
):
    """
    Driver-only: update live GPS coordinates for a trip.
    Also broadcasts to all WebSocket viewers of this trip instantly.
    Called by DriverDashboard.jsx every ~1 second via setInterval.
    """
    db = get_database()
    ok = await trip_service.update_driver_location(
        trip_id=trip_id,
        driver_id=current_user.id,
        lat=data.lat,
        lng=data.lng,
        db=db,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trip not found or you are not the assigned driver.",
        )
    return {"status": "ok", "lat": data.lat, "lng": data.lng}


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket — admin watches live GPS stream
# ──────────────────────────────────────────────────────────────────────────────

@router.websocket("/{trip_id}/location/ws")
async def location_websocket(trip_id: str, websocket: WebSocket):
    """
    WebSocket endpoint for admin to receive real-time driver location.

    Connect: ws://localhost:8000/api/trips/{trip_id}/location/ws
    Messages received: { "lat": float, "lng": float, "ts": "ISO datetime string" }

    The connection stays open until the admin closes the TripDetails page.
    Each time the driver pushes a location update via PUT /location,
    this endpoint immediately receives and forwards the payload.
    """
    await ws_manager.connect(trip_id, websocket)
    try:
        # Keep connection alive — we only send, never receive from admin
        while True:
            # Wait for any message (ping/pong keepalive or disconnect)
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(trip_id, websocket)

# ──────────────────────────────────────────────────────────────────────────────
# WebSocket — global admin watches all active trips
# ──────────────────────────────────────────────────────────────────────────────

@router.websocket("/all-locations/ws")
async def all_locations_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for admin to receive real-time driver locations for all trips.
    """
    await ws_manager.connect_global(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_global(websocket)
