"""
Expenses routes — CRUD endpoints for managing vehicle and trip expenses.
"""
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.expense import ExpenseInDB
from app.models.user import UserRole
from app.routes.auth import get_current_user, require_owner
from app.schemas.expense import (
    ExpenseCreateRequest, 
    ExpenseResponse,
    VerifyReceiptRequest,
    VerifyReceiptResponse
)
from app.services.receipt_extractor import receipt_extractor
import os
import math

router = APIRouter()

def _to_response(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    doc.pop("owner_id", None)
    for field in ("date", "created_at"):
        if field in doc and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    return doc

@router.post(
    "/",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new expense",
)
async def create_expense(
    data: ExpenseCreateRequest,
    current_user=Depends(get_current_user),
):
    """
    Both Owner and Driver can create an expense.
    Drivers can only log expenses for their currently assigned vehicle/trip.
    """
    db = get_database()
    now = datetime.utcnow()
    
    # Identify the owner ID
    if current_user.role == UserRole.OWNER:
        owner_id = current_user.id
    else:
        owner_id = current_user.owner_id
        if not owner_id:
            raise HTTPException(status_code=400, detail="Driver is not assigned to an owner")
        
        # Optionally validate if the driver is logging for their own assigned truck
        if current_user.assigned_truck_id != data.vehicle_id:
            # We allow it, or restrict? Let's restrict it so drivers can't log for other trucks
            raise HTTPException(status_code=403, detail="You can only log expenses for your assigned vehicle")

    expense_date = data.date if data.date else now

    doc = {
        "owner_id": owner_id,
        "vehicle_id": data.vehicle_id,
        "trip_id": data.trip_id,
        "category": data.category,
        "amount": data.amount,
        "date": expense_date,
        "notes": data.notes or "",
        "audio_note_url": data.audio_note_url,
        "receipt_url": data.receipt_url,
        "location_lat": data.location_lat,
        "location_lng": data.location_lng,
        "recorded_by": current_user.name or current_user.email,
        "created_at": now,
    }

    result = await db.expenses.insert_one(doc)
    doc["_id"] = result.inserted_id
    
    return _to_response(doc)


@router.get(
    "/",
    response_model=list[ExpenseResponse],
    summary="List expenses by trip or vehicle",
)
async def list_expenses(
    trip_id: Optional[str] = None,
    vehicle_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """
    Fetch expenses. Can filter by trip_id or vehicle_id.
    """
    db = get_database()
    
    # Identify the owner ID to filter by
    owner_id = current_user.id if current_user.role == UserRole.OWNER else current_user.owner_id

    query = {"owner_id": owner_id}
    if trip_id:
        query["trip_id"] = trip_id
    if vehicle_id:
        query["vehicle_id"] = vehicle_id

    cursor = db.expenses.find(query).sort("date", -1)
    expenses = []
    async for doc in cursor:
        expenses.append(_to_response(doc))
        
    return expenses

@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an expense",
)
async def delete_expense(
    expense_id: str,
    current_owner=Depends(require_owner),
):
    """Admin only: Delete an expense record."""
    db = get_database()
    try:
        oid = ObjectId(expense_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")

    result = await db.expenses.delete_one({"_id": oid, "owner_id": current_owner.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return None

@router.post(
    "/verify-receipt",
    response_model=VerifyReceiptResponse,
    summary="Verify receipt amount against user input",
)
async def verify_receipt(
    data: VerifyReceiptRequest,
    current_user=Depends(get_current_user),
):
    """
    Takes an uploaded receipt URL and the user-entered amount.
    Extracts the amount from the receipt using Qwen2.5-VL and checks if they match.
    """
    # The receipt_url is typically returned by the upload endpoint as "/uploads/filename"
    # We need to map it to the local file path.
    if not data.receipt_url.startswith("/uploads/"):
        raise HTTPException(status_code=400, detail="Invalid receipt URL format")
        
    filename = data.receipt_url.replace("/uploads/", "")
    file_path = os.path.join("uploads", filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Receipt file not found")
        
    try:
        extracted_amount = await receipt_extractor.extract_amount(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process receipt: {str(e)}")
        
    if extracted_amount is None:
        return VerifyReceiptResponse(match=False, extracted_amount=None)
        
    # Check if they match within a reasonable tolerance (e.g., 0.01)
    match = math.isclose(data.amount, extracted_amount, abs_tol=0.01)
    
    return VerifyReceiptResponse(
        match=match,
        extracted_amount=extracted_amount
    )
