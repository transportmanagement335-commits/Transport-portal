"""
Inquiries routes — CRUD for bus inquiry leads.

Route summary:
  POST   /api/inquiries/        → Create inquiry (owner only)
  GET    /api/inquiries/        → List all inquiries for this owner (newest first)
  PUT    /api/inquiries/{id}    → Update inquiry (e.g. change status)
  DELETE /api/inquiries/{id}    → Delete an inquiry
"""
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_database
from app.routes.auth import require_owner
from app.schemas.inquiry import InquiryCreate, InquiryResponse, InquiryUpdate

router = APIRouter()


def _to_response(doc: dict) -> InquiryResponse:
    """Convert a raw MongoDB document to InquiryResponse."""
    doc["id"] = str(doc.pop("_id"))
    if isinstance(doc.get("owner_id"), ObjectId):
        doc["owner_id"] = str(doc["owner_id"])
    return InquiryResponse(**doc)


# ──────────────────────────────────────────────────────────────────────────────
# Create inquiry
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/",
    response_model=InquiryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Log a new bus inquiry/lead",
)
async def create_inquiry(
    data: InquiryCreate,
    current_owner=Depends(require_owner),
):
    db = get_database()
    now = datetime.utcnow()
    doc = {
        "owner_id": current_owner.id,
        **data.model_dump(),
        "status": "Open",
        "created_at": now,
        "updated_at": now,
    }
    result = await db.inquiries.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


# ──────────────────────────────────────────────────────────────────────────────
# List inquiries
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[InquiryResponse],
    summary="List all inquiries for this owner",
)
async def list_inquiries(current_owner=Depends(require_owner)):
    db = get_database()
    cursor = db.inquiries.find(
        {"owner_id": current_owner.id}
    ).sort("created_at", -1)
    docs = await cursor.to_list(length=500)
    return [_to_response(doc) for doc in docs]


# ──────────────────────────────────────────────────────────────────────────────
# Update inquiry
# ──────────────────────────────────────────────────────────────────────────────

@router.put(
    "/{inquiry_id}",
    response_model=InquiryResponse,
    summary="Update an inquiry (status, fields, etc.)",
)
async def update_inquiry(
    inquiry_id: str,
    data: InquiryUpdate,
    current_owner=Depends(require_owner),
):
    db = get_database()
    if not ObjectId.is_valid(inquiry_id):
        raise HTTPException(status_code=400, detail="Invalid inquiry ID")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.utcnow()

    result = await db.inquiries.find_one_and_update(
        {"_id": ObjectId(inquiry_id), "owner_id": current_owner.id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    # If the inquiry was just converted, auto-add to customers if not exists
    if updates.get("status") == "Converted":
        customer_query = {"owner_id": current_owner.id}
        if result.get("customer_phone"):
            customer_query["phone"] = result["customer_phone"]
        else:
            customer_query["name"] = result["customer_name"]
            
        existing_customer = await db.customers.find_one(customer_query)
        if not existing_customer:
            now = datetime.utcnow()
            new_customer = {
                "owner_id": current_owner.id,
                "name": result["customer_name"],
                "contact_person": None,
                "email": None,
                "phone": result.get("customer_phone"),
                "address": None,
                "gst_number": None,
                "payment_terms_days": 30,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            await db.customers.insert_one(new_customer)

    return _to_response(result)


# ──────────────────────────────────────────────────────────────────────────────
# Delete inquiry
# ──────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/{inquiry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an inquiry",
)
async def delete_inquiry(
    inquiry_id: str,
    current_owner=Depends(require_owner),
):
    db = get_database()
    if not ObjectId.is_valid(inquiry_id):
        raise HTTPException(status_code=400, detail="Invalid inquiry ID")

    result = await db.inquiries.delete_one(
        {"_id": ObjectId(inquiry_id), "owner_id": current_owner.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inquiry not found")
