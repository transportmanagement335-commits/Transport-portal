"""
Trip service — business logic for CRUD operations on trips.
Handles integration with Messaging, Scheduler, Payment, and WebSocket services.
"""
import random
from datetime import datetime
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas.trip import TripCreateRequest, TripUpdateRequest
from app.services.messaging_service import send_driver_trip_message, send_client_booking_message
from app.services.payment_service import create_payment_link
from app.services.scheduler_service import schedule_trip_reminders, cancel_trip_reminders
from app.services.websocket_manager import ws_manager


# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

TRUCK_KEYWORDS = ["truck", "container", "flatbed", "refrigerated", "heavy-duty", "heavy"]


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _is_truck(vehicle_type: str) -> bool:
    """Return True if the vehicle type indicates a truck/goods vehicle."""
    return any(k in vehicle_type.lower() for k in TRUCK_KEYWORDS)


def _to_response(doc: dict) -> dict:
    """Convert raw MongoDB trip to response schema dict."""
    doc["id"] = str(doc.pop("_id"))
    doc.pop("owner_id", None)
    # Convert dates to strings for JSON serialisation
    for field in ("reporting_time", "created_at", "updated_at", "location_updated_at"):
        if field in doc and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    # Ensure duty_log entries have serialisable timestamps
    if "duty_log" in doc and isinstance(doc["duty_log"], list):
        for entry in doc["duty_log"]:
            if "timestamp" in entry and isinstance(entry["timestamp"], datetime):
                entry["timestamp"] = entry["timestamp"].isoformat()
    return doc


# ──────────────────────────────────────────────────────────────────────────────
# CRUD
# ──────────────────────────────────────────────────────────────────────────────

async def create_trip(
    data: TripCreateRequest,
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> dict:
    """
    Create a new trip.
    1. Fetch Vehicle & Driver info
    2. Auto-generate GR number + E-way bill for truck vehicles
    3. Generate Payment Link
    4. Save to DB
    5. Send SMS to Driver & Client
    6. Schedule Reminders
    """
    now = datetime.utcnow()

    # Fetch Vehicle
    vehicle = await db.vehicles.find_one({"_id": ObjectId(data.vehicle_id)})
    if not vehicle:
        raise ValueError("Vehicle not found")

    driver_id = vehicle.get("driver_id")
    driver = None
    if driver_id:
        driver = await db.users.find_one({"_id": ObjectId(driver_id), "role": "driver"})

    if not driver:
        raise ValueError("No valid driver assigned to this vehicle")

    vehicle_type = vehicle.get("type", "")

    # Build document
    doc = {
        "owner_id": owner_id,
        "trip_id": data.trip_id,
        "vehicle_id": data.vehicle_id,
        "vehicle_number": vehicle.get("number", ""),
        "vehicle_type": vehicle_type,
        "driver_id": driver_id,
        "driver_name": driver.get("name", ""),
        "driver_phone": driver.get("phone", ""),
        "client_name": data.client_name,
        "client_phone": data.client_phone,
        "pickup_location": data.pickup_location,
        "drop_location": data.drop_location,
        "reporting_time": data.reporting_time,
        "notes": data.notes,
        "balance_amount": data.balance_amount,
        "trip_cost": data.balance_amount,
        "amount_paid": 0.0,
        "payment_status": "Pending",
        "trip_status": "Scheduled",
        "driver_msg_sent": False,
        "client_msg_sent": False,
        # Duty log (empty initially)
        "duty_log": [],
        # GPS (empty initially)
        "driver_lat": None,
        "driver_lng": None,
        "location_updated_at": None,
        "created_at": now,
        "updated_at": now,
    }

    # ── Auto-generate GR number + E-way bill for truck vehicles ──────────────
    if _is_truck(vehicle_type):
        doc["gr_number"] = f"GR-{now.strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
        doc["eway_bill"] = f"EWB-{int(now.timestamp())}"
    else:
        doc["gr_number"] = None
        doc["eway_bill"] = None

    # ── Bus-specific permit fields (passed from request if provided) ──────────
    doc["permit_number"] = data.permit_number
    doc["passing_info"] = data.passing_info

    result = await db.trips.insert_one(doc)
    trip_db_id = str(result.inserted_id)
    doc["_id"] = result.inserted_id
    doc["id"] = trip_db_id

    # Generate payment link (fire-and-forget)
    payment_link = create_payment_link(doc["trip_id"], doc["balance_amount"], doc["client_name"])
    doc["payment_link"] = payment_link

    # Send Messages (Fire & Forget)
    driver_sent = send_driver_trip_message(
        driver={"name": doc["driver_name"], "phone": doc["driver_phone"]},
        trip=doc,
        vehicle=vehicle
    )

    client_sent = send_client_booking_message(
        trip=doc,
        vehicle=vehicle,
        payment_link=payment_link
    )

    # Save payment_link + msg flags to DB in one update
    await db.trips.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "payment_link": payment_link,
            "driver_msg_sent": driver_sent,
            "client_msg_sent": client_sent,
        }}
    )
    doc["driver_msg_sent"] = driver_sent
    doc["client_msg_sent"] = client_sent

    # Update Vehicle Status
    await db.vehicles.update_one({"_id": vehicle["_id"]}, {"$set": {"status": "Booked", "updated_at": now}})

    # Schedule Reminders
    schedule_trip_reminders(doc, doc["driver_phone"], doc["driver_name"])

    return _to_response(doc)


async def get_all_trips(owner_id: str, db: AsyncIOMotorDatabase) -> list[dict]:
    """List all trips for the owner."""
    cursor = db.trips.find({"owner_id": owner_id}).sort("reporting_time", -1)
    trips = []
    async for doc in cursor:
        trips.append(_to_response(doc))
    return trips


async def get_trip_by_id(trip_id: str, owner_id: str, db: AsyncIOMotorDatabase) -> Optional[dict]:
    """Get single trip."""
    try:
        oid = ObjectId(trip_id)
    except Exception:
        return None
    doc = await db.trips.find_one({"_id": oid, "owner_id": owner_id})
    if not doc:
        return None
    return _to_response(doc)


async def update_trip(
    trip_id: str,
    data: TripUpdateRequest,
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """Update trip and reschedule reminders if reporting time changes."""
    try:
        oid = ObjectId(trip_id)
    except Exception:
        return None

    old_doc = await db.trips.find_one({"_id": oid, "owner_id": owner_id})
    if not old_doc:
        return None

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        return _to_response(old_doc)

    updates["updated_at"] = datetime.utcnow()
    await db.trips.update_one({"_id": oid}, {"$set": updates})

    doc = await db.trips.find_one({"_id": oid})

    # Reschedule reminders if reporting time changed
    if "reporting_time" in updates:
        schedule_trip_reminders(doc, doc["driver_phone"], doc["driver_name"])

    # Free up vehicle if cancelled/completed
    if updates.get("trip_status") in ["Completed", "Cancelled"]:
        cancel_trip_reminders(trip_id)
        if doc.get("vehicle_id"):
            await db.vehicles.update_one(
                {"_id": ObjectId(doc["vehicle_id"])},
                {"$set": {"status": "Active", "updated_at": datetime.utcnow()}}
            )

    return _to_response(doc)


async def delete_all_trips(owner_id: str, db: AsyncIOMotorDatabase) -> int:
    """Delete all trips for the owner (useful for testing/cleanup)."""
    cursor = db.trips.find({"owner_id": owner_id})
    async for doc in cursor:
        trip_id = str(doc["_id"])
        cancel_trip_reminders(trip_id)

        # Free up vehicle
        if doc.get("vehicle_id"):
            await db.vehicles.update_one(
                {"_id": ObjectId(doc["vehicle_id"])},
                {"$set": {"status": "Active", "updated_at": datetime.utcnow()}}
            )

    result = await db.trips.delete_many({"owner_id": owner_id})
    return result.deleted_count


# ──────────────────────────────────────────────────────────────────────────────
# Real-time GPS location update
# ──────────────────────────────────────────────────────────────────────────────

async def update_driver_location(
    trip_id: str,
    driver_id: str,
    lat: float,
    lng: float,
    db: AsyncIOMotorDatabase,
) -> bool:
    """
    Update driver GPS coordinates and broadcast to all WebSocket viewers.
    Returns False if trip not found or driver mismatch.
    """
    try:
        oid = ObjectId(trip_id)
    except Exception:
        return False

    # Validate driver owns this trip
    trip = await db.trips.find_one({"_id": oid})
    if not trip:
        return False
    if str(trip.get("driver_id", "")) != driver_id:
        return False

    now = datetime.utcnow()
    await db.trips.update_one(
        {"_id": oid},
        {"$set": {
            "driver_lat": lat,
            "driver_lng": lng,
            "location_updated_at": now,
            "updated_at": now,
        }}
    )

    # Broadcast to all admin WebSocket connections watching this trip
    await ws_manager.broadcast(trip_id, {
        "lat": lat,
        "lng": lng,
        "ts": now.isoformat(),
    })

    return True


# ──────────────────────────────────────────────────────────────────────────────
# Duty log
# ──────────────────────────────────────────────────────────────────────────────

async def add_duty_log_entry(
    trip_id: str,
    action: str,
    note: Optional[str],
    logged_by: str,
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """
    Append a duty log entry to the trip's duty_log array.
    Returns the updated trip response or None if not found.
    """
    try:
        oid = ObjectId(trip_id)
    except Exception:
        return None

    now = datetime.utcnow()
    entry = {
        "timestamp": now,
        "action": action,
        "note": note or "",
        "logged_by": logged_by,
    }

    result = await db.trips.update_one(
        {"_id": oid},
        {
            "$push": {"duty_log": entry},
            "$set": {"updated_at": now},
        }
    )

    if result.matched_count == 0:
        return None

    doc = await db.trips.find_one({"_id": oid})
    return _to_response(doc)
