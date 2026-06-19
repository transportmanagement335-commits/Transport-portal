"""
Customers routes — CRUD for transport company clients.

Route summary:
  POST   /api/customers/        → Create customer (owner only)
  GET    /api/customers/        → List all customers for this owner
  GET    /api/customers/{id}    → Get single customer
  PUT    /api/customers/{id}    → Update customer
  DELETE /api/customers/{id}    → Soft delete (is_active = false)
"""
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_database
from app.routes.auth import require_owner
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate

router = APIRouter()


def _to_response(doc: dict) -> CustomerResponse:
    """Convert MongoDB doc to CustomerResponse."""
    doc["id"] = str(doc.pop("_id"))
    if isinstance(doc.get("owner_id"), ObjectId):
        doc["owner_id"] = str(doc["owner_id"])
    return CustomerResponse(**doc)


# ──────────────────────────────────────────────────────────────────────────────
# Create customer
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new customer/client",
)
async def create_customer(
    data: CustomerCreate,
    current_owner=Depends(require_owner),
):
    """Owner-only: create a new customer (client) for this transport company."""
    db = get_database()
    now = datetime.utcnow()

    doc = {
        "owner_id": current_owner.id,
        **data.model_dump(),
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.customers.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


# ──────────────────────────────────────────────────────────────────────────────
# List customers
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[CustomerResponse],
    summary="List all customers for this owner",
)
async def list_customers(current_owner=Depends(require_owner)):
    """Return all active and inactive customers belonging to this owner."""
    db = get_database()
    customers = []
    cursor = db.customers.find({"owner_id": current_owner.id}).sort("name", 1)
    async for doc in cursor:
        customers.append(_to_response(doc))
    return customers


# ──────────────────────────────────────────────────────────────────────────────
# Get single customer
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Get a single customer by ID",
)
async def get_customer(
    customer_id: str,
    current_owner=Depends(require_owner),
):
    db = get_database()
    try:
        oid = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid customer ID")

    doc = await db.customers.find_one({"_id": oid, "owner_id": current_owner.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _to_response(doc)


# ──────────────────────────────────────────────────────────────────────────────
# Update customer
# ──────────────────────────────────────────────────────────────────────────────

@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Update a customer",
)
async def update_customer(
    customer_id: str,
    data: CustomerUpdate,
    current_owner=Depends(require_owner),
):
    db = get_database()
    try:
        oid = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid customer ID")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.utcnow()
    result = await db.customers.update_one(
        {"_id": oid, "owner_id": current_owner.id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")

    doc = await db.customers.find_one({"_id": oid})
    return _to_response(doc)


# ──────────────────────────────────────────────────────────────────────────────
# Soft delete customer
# ──────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/{customer_id}",
    status_code=status.HTTP_200_OK,
    summary="Soft-delete a customer (sets is_active = false)",
)
async def delete_customer(
    customer_id: str,
    current_owner=Depends(require_owner),
):
    db = get_database()
    try:
        oid = ObjectId(customer_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid customer ID")

    result = await db.customers.update_one(
        {"_id": oid, "owner_id": current_owner.id},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")

    return {"message": "Customer deactivated successfully"}
