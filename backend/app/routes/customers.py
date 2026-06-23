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

    # Fetch old document FIRST so we can match old trip names
    old_doc = await db.customers.find_one({"_id": oid, "owner_id": current_owner.id})
    if not old_doc:
        raise HTTPException(status_code=404, detail="Customer not found")

    updates["updated_at"] = datetime.utcnow()
    result = await db.customers.update_one(
        {"_id": oid, "owner_id": current_owner.id},
        {"$set": updates},
    )

    doc = await db.customers.find_one({"_id": oid})

    # ── Cascade updated fields to invoices & trips ────────────────────────────
    # Invoices store a snapshot of customer info in `recipient_details`.
    # Trips store client_name / client_phone directly on the document.
    # We propagate any changed fields so the Payments page stays in sync.

    customer_id_str = str(oid)

    # Build the invoice recipient_details patch (only changed fields)
    invoice_patch = {}
    field_map = {
        "name":    "recipient_details.name",
        "phone":   "recipient_details.phone",
        "email":   "recipient_details.email",
        "address": "recipient_details.address",
        "gst":     "recipient_details.gst",
        "city":    "recipient_details.city",
        "state":   "recipient_details.state",
        "country": "recipient_details.country",
    }
    for customer_field, invoice_field in field_map.items():
        if customer_field in updates:
            invoice_patch[invoice_field] = updates[customer_field]

    if invoice_patch:
        # Note: Invoices use `issuer_id` for the owner/transport company
        await db.invoices.update_many(
            {"recipient_id": customer_id_str, "issuer_id": current_owner.id},
            {"$set": invoice_patch},
        )

    # Cascade name and phone to trips (used in Payments + messaging)
    trip_patch = {}
    if "name"  in updates:
        trip_patch["client_name"]  = updates["name"]
    if "phone" in updates:
        trip_patch["client_phone"] = updates["phone"]

    if trip_patch:
        # Match using the OLD name so we catch trips before the rename!
        await db.trips.update_many(
            {"client_name": old_doc.get("name"), "owner_id": current_owner.id},
            {"$set": trip_patch},
        )

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
