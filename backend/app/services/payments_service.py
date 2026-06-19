from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.schemas.payment import PaymentCreateRequest
from app.services.payment_service import create_payment_link

def _to_response(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    if "trip_id" in doc:
        doc["trip_id"] = str(doc["trip_id"])
    doc.pop("owner_id", None)
    if "created_at" in doc and isinstance(doc["created_at"], datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc

async def add_payment(data: PaymentCreateRequest, owner_id: str, db: AsyncIOMotorDatabase) -> dict:
    """Log a new payment transaction and update the trip's cost and amount paid."""
    trip = await db.trips.find_one({"_id": ObjectId(data.trip_id), "owner_id": owner_id})
    if not trip:
        raise ValueError("Trip not found")

    new_balance = max(0, float(trip.get("balance_amount", 0.0)) - data.amount_paid)
    
    status = "Pending"
    if new_balance == 0:
        status = "Paid"
    elif new_balance < float(trip.get("balance_amount", 0.0)):
        status = "Partial"
    else:
        status = trip.get("payment_status", "Pending")

    # Only create transaction if amount_paid > 0
    if data.amount_paid > 0:
        payment_doc = {
            "owner_id": owner_id,
            "trip_id": str(trip["_id"]),
            "client_name": trip.get("client_name", "Unknown"),
            "vehicle_number": trip.get("vehicle_number", "Unknown"),
            "amount": data.amount_paid,
            "method": data.method,
            "transaction_id": data.transaction_id,
            "created_at": datetime.utcnow()
        }
        await db.payments.insert_one(payment_doc)

    # Generate payment link if there's a balance and no link exists
    payment_link = trip.get("payment_link")
    if new_balance > 0 and not payment_link:
        payment_link = create_payment_link(str(trip["_id"]), new_balance, trip.get("client_name", "Unknown"))

    new_amount_paid = float(trip.get("amount_paid", 0.0)) + data.amount_paid

    # Update trip
    await db.trips.update_one(
        {"_id": trip["_id"]},
        {"$set": {
            "balance_amount": new_balance,
            "amount_paid": new_amount_paid,
            "payment_status": status,
            "payment_link": payment_link,
            "updated_at": datetime.utcnow()
        }}
    )
    
    trip["balance_amount"] = new_balance
    trip["amount_paid"] = new_amount_paid
    trip["payment_status"] = status
    trip["payment_link"] = payment_link
    
    # We return the updated trip info to the UI
    trip["id"] = str(trip.pop("_id"))
    trip.pop("owner_id", None)
    if "reporting_time" in trip and isinstance(trip["reporting_time"], datetime):
        trip["reporting_time"] = trip["reporting_time"].isoformat()
    if "created_at" in trip and isinstance(trip["created_at"], datetime):
        trip["created_at"] = trip["created_at"].isoformat()
    if "updated_at" in trip and isinstance(trip["updated_at"], datetime):
        trip["updated_at"] = trip["updated_at"].isoformat()
    
    return trip

async def get_all_transactions(owner_id: str, db: AsyncIOMotorDatabase) -> list[dict]:
    cursor = db.payments.find({"owner_id": owner_id}).sort("created_at", -1)
    return [_to_response(doc) async for doc in cursor]

async def delete_payment(payment_id: str, owner_id: str, db: AsyncIOMotorDatabase) -> bool:
    try:
        oid = ObjectId(payment_id)
    except:
        return False
        
    payment = await db.payments.find_one({"_id": oid, "owner_id": owner_id})
    if not payment:
        return False
        
    # Subtract from trip's amount_paid
    trip_id = ObjectId(payment["trip_id"])
    trip = await db.trips.find_one({"_id": trip_id})
    if trip:
        new_paid = max(0, trip.get("amount_paid", 0.0) - payment["amount"])
        balance = trip.get("trip_cost", 0.0) - new_paid
        
        status = "Pending"
        if new_paid > 0 and balance > 0:
            status = "Partial"
        elif balance <= 0 and trip.get("trip_cost", 0.0) > 0:
            status = "Paid"
            
        await db.trips.update_one(
            {"_id": trip_id},
            {"$set": {"amount_paid": new_paid, "payment_status": status}}
        )
        
    await db.payments.delete_one({"_id": oid})
    return True
