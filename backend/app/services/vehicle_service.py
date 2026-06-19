"""
Vehicle service — business logic for CRUD operations on the vehicles collection.
"""
from datetime import datetime, date
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.vehicle import VehicleInDB
from app.schemas.vehicle import VehicleCreateRequest, VehicleUpdateRequest


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _to_response(doc: dict) -> dict:
    """Convert a raw MongoDB document to a clean dict for the response schema."""
    doc["id"] = str(doc.pop("_id"))
    doc.pop("owner_id", None)
    doc.pop("created_at", None)
    doc.pop("updated_at", None)
    return doc


# ──────────────────────────────────────────────────────────────────────────────
# CRUD
# ──────────────────────────────────────────────────────────────────────────────

async def create_vehicle(
    data: VehicleCreateRequest,
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> dict:
    """Insert a new vehicle document into MongoDB."""
    now = datetime.utcnow()
    doc = {
        "owner_id": owner_id,
        "number": data.number,
        "type": data.type,
        "model": data.model,
        "driver": data.driver,
        "driver_id": data.driver_id,
        "insurance": data.insurance,
        "permit": data.permit,
        "fitness": data.fitness,
        "puc": data.puc,
        "status": data.status,
        "truck_size": data.truck_size,
        "body_type": data.body_type,
        "truck_category": data.truck_category,
        "bus_type": data.bus_type,
        "seating_capacity": data.seating_capacity,
        "location": data.location,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.vehicles.insert_one(doc)
    vehicle_id = str(result.inserted_id)
    doc["_id"] = result.inserted_id
    
    if data.driver_id:
        try:
            await db.users.update_one(
                {"_id": ObjectId(data.driver_id), "role": "driver"},
                {"$set": {"assigned_truck_id": vehicle_id}}
            )
        except Exception:
            pass

    return _to_response(doc)


async def get_all_vehicles(
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> list[dict]:
    """Return all vehicles belonging to the owner."""
    cursor = db.vehicles.find({"owner_id": owner_id})
    vehicles = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        vehicles.append(_to_response(doc))
    return vehicles


async def get_vehicle_by_id(
    vehicle_id: str,
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """Return a single vehicle by its MongoDB ObjectId."""
    try:
        oid = ObjectId(vehicle_id)
    except Exception:
        return None
    doc = await db.vehicles.find_one({"_id": oid})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return _to_response(doc)


async def update_vehicle(
    vehicle_id: str,
    data: VehicleUpdateRequest,
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """Partially update a vehicle document."""
    try:
        oid = ObjectId(vehicle_id)
    except Exception:
        return None

    old_vehicle = await db.vehicles.find_one({"_id": oid})
    if not old_vehicle:
        return None
    old_driver_id = old_vehicle.get("driver_id")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        doc = await db.vehicles.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
            return _to_response(doc)
        return None

    updates["updated_at"] = datetime.utcnow()
    await db.vehicles.update_one({"_id": oid}, {"$set": updates})

    new_driver_id = updates.get("driver_id", old_driver_id)
    if new_driver_id != old_driver_id:
        if old_driver_id:
            try:
                await db.users.update_one(
                    {"_id": ObjectId(old_driver_id), "role": "driver"},
                    {"$set": {"assigned_truck_id": None}}
                )
            except Exception:
                pass
        if new_driver_id:
            try:
                await db.users.update_one(
                    {"_id": ObjectId(new_driver_id), "role": "driver"},
                    {"$set": {"assigned_truck_id": vehicle_id}}
                )
            except Exception:
                pass

    doc = await db.vehicles.find_one({"_id": oid})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return _to_response(doc)


# ──────────────────────────────────────────────────────────────────────────────
# Stats helpers
# ──────────────────────────────────────────────────────────────────────────────

async def get_vehicle_counts(owner_id: str, db: AsyncIOMotorDatabase) -> dict:
    """Return counts of vehicles by status for admin stats."""
    total = await db.vehicles.count_documents({"owner_id": owner_id})
    active = await db.vehicles.count_documents({"owner_id": owner_id, "status": "Active"})
    booked = await db.vehicles.count_documents({"owner_id": owner_id, "status": "Booked"})
    maintenance = await db.vehicles.count_documents({"owner_id": owner_id, "status": "Maintenance"})
    return {
        "total": total,
        "active": active,
        "booked": booked,
        "maintenance": maintenance,
    }


async def get_recent_activity(owner_id: str, db: AsyncIOMotorDatabase, limit: int = 10) -> list[dict]:
    """Return the most recently updated vehicles as activity rows."""
    cursor = db.vehicles.find(
        {"owner_id": owner_id},
        sort=[("updated_at", -1)],
    ).limit(limit)
    rows = []
    async for doc in cursor:
        rows.append({
            "vehicle": doc.get("number", ""),
            "driver": doc.get("driver", ""),
            "status": doc.get("status", ""),
            "location": doc.get("location", ""),
        })
    return rows


async def get_expiring_documents_count(owner_id: str, db: AsyncIOMotorDatabase, days: int = 30) -> int:
    """Count vehicles whose insurance, permit, or fitness expires within `days` days."""
    today = date.today().isoformat()
    cutoff = date.fromordinal(date.today().toordinal() + days).isoformat()
    count = await db.vehicles.count_documents({
        "owner_id": owner_id,
        "$or": [
            {"insurance": {"$gte": today, "$lte": cutoff}},
            {"permit": {"$gte": today, "$lte": cutoff}},
            {"fitness": {"$gte": today, "$lte": cutoff}},
        ],
    })
    return count


async def get_enriched_dashboard_stats(owner_id: str, db: AsyncIOMotorDatabase) -> dict:
    """
    Compile detailed statistics for the admin dashboard.
    All data pulled from real MongoDB collections — no mocks.
    """
    # 1. Vehicle counts by status
    available_vehicles  = await db.vehicles.count_documents({"owner_id": owner_id, "status": "Active"})
    booked_vehicles     = await db.vehicles.count_documents({"owner_id": owner_id, "status": "Booked"})
    maintenance_vehicles = await db.vehicles.count_documents({"owner_id": owner_id, "status": "Maintenance"})
    total_vehicles = available_vehicles + booked_vehicles + maintenance_vehicles

    type_distribution = {}
    async for doc in db.vehicles.find({"owner_id": owner_id}):
        base_type = doc.get("type") or "Unknown"
        if base_type == "Bus":
            bt = doc.get("bus_type", "")
            bc = doc.get("bus_category", "")
            subtype = f"Bus - {bt} {bc}".strip() if (bt or bc) else "Bus"
        elif base_type == "Truck":
            tc = doc.get("truck_category", "")
            ts = doc.get("truck_size", "")
            subtype = f"Truck - {tc} {ts}".strip() if (tc or ts) else "Truck"
        else:
            subtype = base_type
            
        type_distribution[subtype] = type_distribution.get(subtype, 0) + 1

    # 3. Document Expiry Alerts (Insurance, Permit, Fitness, PUC)
    today_date = date.today()
    cursor = db.vehicles.find({"owner_id": owner_id})
    document_expiry_alerts = []
    pending_docs_set = set()

    async for v in cursor:
        v_num = v.get("number", "Unknown")
        v_id  = str(v.get("_id"))
        doc_fields = [
            ("Insurance", v.get("insurance")),
            ("Permit",    v.get("permit")),
            ("Fitness",   v.get("fitness")),
            ("PUC",       v.get("puc")),
        ]
        for label, date_str in doc_fields:
            if not date_str:
                continue
            try:
                exp_date  = datetime.strptime(date_str, "%Y-%m-%d").date()
                days_left = (exp_date - today_date).days
                if days_left <= 30:
                    status = "Expired" if days_left < 0 else "Expiring Soon"
                    document_expiry_alerts.append({
                        "vehicle_number": v_num,
                        "doc_type":       label,
                        "expiry_date":    date_str,
                        "days_left":      days_left,
                        "status":         status,
                    })
                    pending_docs_set.add(v_id)
            except Exception:
                pass

    document_expiry_alerts.sort(key=lambda x: x["days_left"])

    # 4. Trips today — count trips whose reporting_time falls today
    today_start = datetime.combine(today_date, datetime.min.time())
    today_end   = datetime.combine(today_date, datetime.max.time())
    trips_today = await db.trips.count_documents({
        "owner_id":       owner_id,
        "reporting_time": {"$gte": today_start, "$lte": today_end},
    })

    # 5. REAL Payments summary — from actual trips balance_amount
    pending_balance   = 0.0
    pending_count     = 0
    overdue_balance   = 0.0
    overdue_count     = 0

    trips_cursor = db.trips.find({"owner_id": owner_id})
    async for t in trips_cursor:
        bal = t.get("balance_amount", 0) or 0
        status = t.get("payment_status", "Pending")
        if bal > 0:
            if status in ("Pending", "Partial"):
                # Check if trip reporting time is in the past → overdue
                rep_time = t.get("reporting_time")
                if rep_time and isinstance(rep_time, datetime) and rep_time < datetime.utcnow():
                    overdue_balance += bal
                    overdue_count   += 1
                else:
                    pending_balance += bal
                    pending_count   += 1

    payments = {
        "pending_amount":  pending_balance,
        "overdue_amount":  overdue_balance,
        "pending_count":   pending_count,
        "overdue_count":   overdue_count,
    }

    # 6. Upcoming driver duties — from REAL scheduled trips
    upcoming_duties = []
    upcoming_cursor = db.trips.find(
        {
            "owner_id":    owner_id,
            "trip_status": {"$in": ["Scheduled", "On Trip"]},
            "reporting_time": {"$gte": datetime.utcnow()},
        }
    ).sort("reporting_time", 1).limit(10)

    async for trip in upcoming_cursor:
        upcoming_duties.append({
            "driver_name":    trip.get("driver_name", "Unknown"),
            "vehicle_number": trip.get("vehicle_number", "Unknown"),
            "route":          f"{trip.get('pickup_location', '?')} ➔ {trip.get('drop_location', '?')}",
            "status":         trip.get("trip_status", "Scheduled"),
        })

    # 7. Total Business Profit & Loss
    # Accrual basis: Revenue = Sum of total trip values (trip_cost or balance_amount + amount_paid)
    total_revenue = 0.0
    try:
        rev_cursor = await db.trips.aggregate([
            {"$match": {"owner_id": owner_id}},
            {"$group": {
                "_id": None, 
                "total": {
                    "$sum": {
                        "$cond": [
                            {"$gt": [{"$type": "$trip_cost"}, "missing"]},
                            "$trip_cost",
                            {"$add": [
                                {"$ifNull": ["$balance_amount", 0.0]},
                                {"$ifNull": ["$amount_paid", 0.0]}
                            ]}
                        ]
                    }
                }
            }}
        ]).to_list(length=1)
        if rev_cursor:
            total_revenue = rev_cursor[0].get("total", 0.0)
    except Exception:
        pass

    total_expenses = 0.0
    try:
        exp_cursor = await db.expenses.aggregate([
            {"$match": {"owner_id": owner_id}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(length=1)
        if exp_cursor:
            total_expenses = exp_cursor[0].get("total", 0.0)
    except Exception:
        pass

    total_profit = total_revenue - total_expenses

    return {
        "total_vehicles":          total_vehicles,
        "available_vehicles":      available_vehicles,
        "booked_vehicles":         booked_vehicles,
        "maintenance_vehicles":    maintenance_vehicles,
        "type_distribution":       type_distribution,
        "document_expiry_alerts":  document_expiry_alerts,
        "payments":                payments,
        "upcoming_duties":         upcoming_duties,
        "pending_documents_count": len(pending_docs_set),
        "trips_today":             trips_today,
        "total_profit":            total_profit,
    }
