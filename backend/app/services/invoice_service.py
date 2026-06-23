"""
Invoice service — core business logic for invoice CRUD, payment tracking,
invoice number generation, and trip-to-invoice automation.
"""
from datetime import datetime
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas.invoice import InvoiceCreate, InvoiceUpdate, PaymentRecordRequest


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _serialize_doc(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serialisable dict."""
    doc["id"] = str(doc.pop("_id"))
    for field in ("issue_date", "due_date", "paid_date", "created_at", "updated_at"):
        if field in doc and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    # Serialize payment_records timestamps
    for record in doc.get("payment_records", []):
        if "recorded_at" in record and isinstance(record["recorded_at"], datetime):
            record["recorded_at"] = record["recorded_at"].isoformat()
    return doc


def _calculate_totals(items: list, tax_rate: float, discount: float) -> dict:
    """
    Server-side total calculation — never trust frontend totals.
    Returns subtotal, tax_amount, total_amount.
    """
    subtotal = 0.0
    calculated_items = []
    for item in items:
        qty = float(item.quantity) if hasattr(item, "quantity") else float(item.get("quantity", 1))
        rate = float(item.rate) if hasattr(item, "rate") else float(item.get("rate", 0))
        amount = round(qty * rate, 2)
        subtotal += amount
        item_dict = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        item_dict["amount"] = amount
        calculated_items.append(item_dict)

    subtotal = round(subtotal, 2)
    tax_amount = round(subtotal * (tax_rate / 100), 2)
    total_amount = round(subtotal + tax_amount - discount, 2)

    return {
        "items": calculated_items,
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Invoice number generation (atomic, per-owner per-year)
# ──────────────────────────────────────────────────────────────────────────────

async def generate_invoice_number(owner_id: str, db: AsyncIOMotorDatabase) -> str:
    """
    Atomically generate the next sequential invoice number for this owner.
    Uses a 'counters' collection with find_one_and_update($inc) for idempotency.
    Format: INV-{YYYY}-{SEQUENCE:04d}
    """
    year = datetime.utcnow().year
    counter_key = f"{owner_id}:{year}"

    result = await db.counters.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,  # Return the updated document
    )
    seq = result["seq"]
    return f"INV-{year}-{seq:04d}"


# ──────────────────────────────────────────────────────────────────────────────
# CRUD
# ──────────────────────────────────────────────────────────────────────────────

async def create_invoice(
    owner_id: str,
    admin_id: str,
    data: InvoiceCreate,
    db: AsyncIOMotorDatabase,
) -> dict:
    """
    Create a new invoice.
    1. Fetch & snapshot customer details
    2. Fetch & snapshot issuer (owner) details
    3. Calculate all totals server-side
    4. Insert to MongoDB
    """
    now = datetime.utcnow()

    # Fetch issuer (owner) details for snapshot
    owner = await db.users.find_one({"_id": ObjectId(owner_id)})
    if not owner:
        raise ValueError("Issuer (owner) not found")

    issuer_details = {
        "name": owner.get("company_name") or owner.get("name", ""),
        "address": owner.get("address"),
        "gst": owner.get("gst_number"),
        "phone": owner.get("phone"),
        "email": owner.get("email"),
    }

    # Fetch recipient (customer) details for snapshot
    try:
        recipient_oid = ObjectId(data.recipient_id)
    except Exception:
        raise ValueError("Invalid recipient_id")

    customer = await db.customers.find_one({"_id": recipient_oid, "owner_id": owner_id})
    if not customer:
        raise ValueError("Customer not found or does not belong to this owner")

    recipient_details = {
        "name": customer.get("name", ""),
        "address": customer.get("address"),
        "gst": customer.get("gst_number"),
        "phone": customer.get("phone"),
        "email": customer.get("email"),
    }

    # Calculate totals server-side
    totals = _calculate_totals(data.items, data.tax_rate, data.discount)

    # Normalize due_date to naive UTC
    due_date_naive = data.due_date.replace(tzinfo=None) if data.due_date.tzinfo else data.due_date

    invoice_number = await generate_invoice_number(owner_id, db)

    # Carry over pre-paid amounts from trips
    pre_paid_amount = 0.0
    payment_records = []
    if data.trip_ids:
        trip_oids = []
        for tid in data.trip_ids:
            try:
                trip_oids.append(ObjectId(tid))
            except Exception:
                pass
        if trip_oids:
            async for t in db.trips.find({"_id": {"$in": trip_oids}, "owner_id": owner_id}):
                amt = float(t.get("amount_paid", 0.0))
                if amt > 0:
                    pre_paid_amount += amt

    if pre_paid_amount > 0:
        payment_records.append({
            "amount": round(pre_paid_amount, 2),
            "method": "carried over",
            "notes": "Pre-paid amount carried over from linked trip(s)",
            "recorded_at": now,
        })

    doc = {
        "invoice_number": invoice_number,
        "invoice_type": data.invoice_type,
        "invoice_stage": getattr(data, "invoice_stage", "final"),
        "issuer_id": owner_id,
        "issuer_details": issuer_details,
        "recipient_id": data.recipient_id,
        "recipient_details": recipient_details,
        "items": totals["items"],
        "subtotal": totals["subtotal"],
        "tax_rate": data.tax_rate,
        "tax_amount": totals["tax_amount"],
        "discount": round(data.discount, 2),
        "total_amount": totals["total_amount"],
        "currency": data.currency,
        "status": "draft",
        "paid_amount": round(pre_paid_amount, 2),
        "payment_records": payment_records,
        "issue_date": now,
        "due_date": due_date_naive,
        "paid_date": now if pre_paid_amount >= totals["total_amount"] and totals["total_amount"] > 0 else None,
        "trip_ids": data.trip_ids,
        "expense_ids": data.expense_ids,
        "notes": data.notes,
        "terms": data.terms,
        "pdf_url": None,
        "proforma_parent_id": None,
        "created_by": admin_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.invoices.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_doc(doc)


async def get_all_invoices(
    owner_id: str,
    db: AsyncIOMotorDatabase,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[dict]:
    """List invoices for the owner with optional filters."""
    query: dict = {"issuer_id": owner_id}

    if status:
        query["status"] = status
    if customer_id:
        query["recipient_id"] = customer_id
    if start_date:
        query.setdefault("issue_date", {})["$gte"] = start_date
    if end_date:
        query.setdefault("issue_date", {})["$lte"] = end_date

    invoices = []
    cursor = db.invoices.find(query).sort("created_at", -1)
    async for doc in cursor:
        invoices.append(_serialize_doc(doc))
    return invoices


async def get_invoice_by_id(
    invoice_id: str,
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """Get single invoice. Enforces multi-tenancy via issuer_id."""
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        return None
    doc = await db.invoices.find_one({"_id": oid, "issuer_id": owner_id})
    if not doc:
        return None
    return _serialize_doc(doc)


async def update_invoice(
    invoice_id: str,
    owner_id: str,
    data: InvoiceUpdate,
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """Update a draft invoice only. Recalculates all totals."""
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        return None

    doc = await db.invoices.find_one({"_id": oid, "issuer_id": owner_id})
    if not doc:
        return None
    if doc.get("status") != "draft":
        raise ValueError("Only draft invoices can be edited")

    updates: dict = {"updated_at": datetime.utcnow()}
    update_data = data.model_dump(exclude_none=True)

    if "items" in update_data or "tax_rate" in update_data or "discount" in update_data:
        items = update_data.get("items", doc.get("items", []))
        tax_rate = update_data.get("tax_rate", doc.get("tax_rate", 0))
        discount = update_data.get("discount", doc.get("discount", 0))
        totals = _calculate_totals(items, tax_rate, discount)
        updates["items"] = totals["items"]
        updates["subtotal"] = totals["subtotal"]
        updates["tax_rate"] = tax_rate
        updates["tax_amount"] = totals["tax_amount"]
        updates["discount"] = round(discount, 2)
        updates["total_amount"] = totals["total_amount"]
    else:
        if "due_date" in update_data:
            dd = update_data["due_date"]
            updates["due_date"] = dd.replace(tzinfo=None) if hasattr(dd, "tzinfo") and dd.tzinfo else dd
        if "notes" in update_data:
            updates["notes"] = update_data["notes"]
        if "terms" in update_data:
            updates["terms"] = update_data["terms"]

    await db.invoices.update_one({"_id": oid}, {"$set": updates})
    doc = await db.invoices.find_one({"_id": oid})
    return _serialize_doc(doc)


async def mark_as_sent(
    invoice_id: str,
    owner_id: str,
    pdf_url: Optional[str],
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """Update invoice status to 'sent', optionally store pdf_url."""
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        return None

    updates: dict = {
        "status": "sent",
        "updated_at": datetime.utcnow(),
    }
    if pdf_url:
        updates["pdf_url"] = pdf_url

    result = await db.invoices.update_one(
        {"_id": oid, "issuer_id": owner_id},
        {"$set": updates},
    )
    if result.matched_count == 0:
        return None
    doc = await db.invoices.find_one({"_id": oid})
    return _serialize_doc(doc)


async def record_payment(
    invoice_id: str,
    owner_id: str,
    data: PaymentRecordRequest,
    db: AsyncIOMotorDatabase,
) -> Optional[dict]:
    """
    Record a partial or full payment.
    - Increments paid_amount
    - Sets status to 'paid' if fully settled, else 'partial'
    - Sets paid_date when fully paid
    """
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        return None

    doc = await db.invoices.find_one({"_id": oid, "issuer_id": owner_id})
    if not doc:
        return None

    new_paid = round(doc.get("paid_amount", 0) + data.amount, 2)
    total = doc.get("total_amount", 0)

    payment_entry = {
        "amount": round(data.amount, 2),
        "method": data.method,
        "notes": data.notes or "",
        "recorded_at": datetime.utcnow(),
    }

    if new_paid >= total:
        new_status = "paid"
        paid_date = datetime.utcnow()
    else:
        new_status = "partial"
        paid_date = doc.get("paid_date")

    await db.invoices.update_one(
        {"_id": oid},
        {
            "$set": {
                "paid_amount": new_paid,
                "status": new_status,
                "paid_date": paid_date,
                "updated_at": datetime.utcnow(),
            },
            "$push": {"payment_records": payment_entry},
        },
    )

    doc = await db.invoices.find_one({"_id": oid})
    return _serialize_doc(doc)


async def delete_invoice(
    invoice_id: str,
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> bool:
    """Delete invoice only if it is in 'draft' status."""
    try:
        oid = ObjectId(invoice_id)
    except Exception:
        return False

    doc = await db.invoices.find_one({"_id": oid, "issuer_id": owner_id})
    if not doc:
        return False
    if doc.get("status") != "draft":
        raise ValueError("Only draft invoices can be deleted")

    await db.invoices.delete_one({"_id": oid})
    return True


async def get_overdue_invoices(
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> list[dict]:
    """Return invoices where due_date < now and status is not paid or cancelled."""
    now = datetime.utcnow()
    cursor = db.invoices.find({
        "issuer_id": owner_id,
        "due_date": {"$lt": now},
        "status": {"$nin": ["paid", "cancelled"]},
    }).sort("due_date", 1)

    # Also update their status to overdue
    invoices = []
    async for doc in cursor:
        if doc.get("status") not in ("paid", "cancelled", "overdue"):
            await db.invoices.update_one(
                {"_id": doc["_id"]},
                {"$set": {"status": "overdue", "updated_at": now}},
            )
            doc["status"] = "overdue"
        invoices.append(_serialize_doc(doc))
    return invoices


async def get_stats(
    owner_id: str,
    db: AsyncIOMotorDatabase,
) -> dict:
    """Aggregate invoice dashboard stats including last 6 months monthly revenue."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_outstanding = 0.0
    overdue_amount = 0.0
    paid_this_month = 0.0
    draft_count = 0

    # Monthly revenue buckets: key = "YYYY-MM", value = total paid
    from collections import defaultdict
    monthly_buckets: dict = defaultdict(float)

    cursor = db.invoices.find({"issuer_id": owner_id})
    async for doc in cursor:
        status = doc.get("status", "draft")
        total = doc.get("total_amount", 0.0)
        paid = doc.get("paid_amount", 0.0)
        balance = round(total - paid, 2)

        if status == "draft":
            draft_count += 1
        elif status in ("sent", "viewed", "partial"):
            total_outstanding += balance
        elif status == "overdue":
            total_outstanding += balance
            overdue_amount += balance

        # Paid this month
        if status == "paid":
            paid_date = doc.get("paid_date")
            if paid_date and paid_date >= month_start:
                paid_this_month += paid

        # Monthly revenue (last 6 months) — bucket by paid_date month
        if status == "paid" and doc.get("paid_date"):
            pd = doc["paid_date"]
            bucket_key = pd.strftime("%Y-%m")
            monthly_buckets[bucket_key] += paid

    # Build last-6-months array (including months with 0 revenue)
    monthly_revenue = []
    import calendar
    for i in range(5, -1, -1):
        month = now.month - i
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        
        target_month = month
        target_year = year
        
        # Format key as YYYY-MM
        key = f"{target_year}-{target_month:02d}"
        
        # Format label as Mon YYYY
        month_abbr = calendar.month_abbr[target_month]
        label = f"{month_abbr} {target_year}"
        
        monthly_revenue.append({"month": label, "total": round(monthly_buckets.get(key, 0.0), 2)})

    return {
        "total_outstanding": round(total_outstanding, 2),
        "overdue_amount": round(overdue_amount, 2),
        "paid_this_month": round(paid_this_month, 2),
        "draft_count": draft_count,
        "monthly_revenue": monthly_revenue,
    }


async def auto_generate_from_trip(
    trip_id: str,
    owner_id: str,
    admin_id: str,
    db: AsyncIOMotorDatabase,
) -> dict:
    """
    Auto-create a draft invoice pre-filled from a completed trip.
    Also appends any approved driver expenses as additional line items.
    Marks the trip as is_invoiced = True after creation.
    """
    try:
        trip_oid = ObjectId(trip_id)
    except Exception:
        raise ValueError("Invalid trip_id")

    trip = await db.trips.find_one({"_id": trip_oid, "owner_id": owner_id})
    if not trip:
        raise ValueError("Trip not found")
    if trip.get("trip_status") != "Completed":
        raise ValueError("Invoice can only be auto-generated for completed trips")
    if trip.get("is_invoiced"):
        raise ValueError("This trip has already been invoiced")

    # Try to find a matching customer by client_name + owner_id
    customer = await db.customers.find_one({
        "owner_id": owner_id,
        "name": {"$regex": f"^{trip.get('client_name', '')}$", "$options": "i"},
    })

    if not customer:
        # Create a minimal customer record from trip data
        now = datetime.utcnow()
        cust_doc = {
            "owner_id": owner_id,
            "name": trip.get("client_name", "Unknown Client"),
            "phone": trip.get("client_phone"),
            "email": None,
            "address": None,
            "gst_number": None,
            "contact_person": None,
            "payment_terms_days": 30,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        result = await db.customers.insert_one(cust_doc)
        customer_id = str(result.inserted_id)
    else:
        customer_id = str(customer["_id"])

    # Build primary line item from trip freight charge
    trip_cost = trip.get("freight_charge") or trip.get("trip_cost") or trip.get("balance_amount") or 0
    route = f"{trip.get('pickup_location', '')} \u2192 {trip.get('drop_location', '')}"

    from app.schemas.invoice import InvoiceCreate, InvoiceItemSchema

    items = [
        InvoiceItemSchema(
            description=f"Freight Charges: {route}",
            quantity=1.0,
            unit="trip",
            rate=float(trip_cost),
            trip_id=trip_id,
        )
    ]

    # Append approved driver expenses as extra line items
    expense_ids: list = []
    async for exp in db.expenses.find({"trip_id": trip_id, "status": "approved"}):
        amount = float(exp.get("amount", 0))
        if amount > 0:
            cat = exp.get("category", "Expense")
            notes_text = exp.get("notes", "")
            desc = f"Expense: {cat}" + (f" \u2014 {notes_text}" if notes_text else "")
            items.append(
                InvoiceItemSchema(
                    description=desc,
                    quantity=1.0,
                    unit="fixed",
                    rate=amount,
                    trip_id=trip_id,
                )
            )
            expense_ids.append(str(exp["_id"]))

    # Default due date: 30 days from now
    from datetime import timedelta
    due_date = datetime.utcnow() + timedelta(days=30)

    data = InvoiceCreate(
        invoice_type="customer",
        invoice_stage="final",
        recipient_id=customer_id,
        items=items,
        tax_rate=0.0,
        discount=0.0,
        due_date=due_date,
        notes=f"Auto-generated from Trip {trip.get('trip_id', trip_id)}",
        trip_ids=[trip_id],
        expense_ids=expense_ids,
    )

    invoice = await create_invoice(owner_id, admin_id, data, db)

    # Mark trip as invoiced
    await db.trips.update_one(
        {"_id": trip_oid},
        {"$set": {
            "is_invoiced": True,
            "invoice_id": invoice["id"],
            "updated_at": datetime.utcnow(),
        }},
    )

    return invoice


# ──────────────────────────────────────────────────────────────────────────────
# Convert proforma → final invoice
# ──────────────────────────────────────────────────────────────────────────────

async def convert_proforma_to_final(
    proforma_id: str,
    owner_id: str,
    admin_id: str,
    adjustments: dict,
    db: AsyncIOMotorDatabase,
) -> dict:
    """
    Clone a proforma/advance invoice into a new final invoice.
    - Generates a NEW sequential invoice number.
    - Sets invoice_stage = "final", proforma_parent_id = proforma_id.
    - Marks linked trips as is_invoiced = True.
    - Applies any item/amount adjustments passed in the request body.
    """
    try:
        proforma_oid = ObjectId(proforma_id)
    except Exception:
        raise ValueError("Invalid proforma invoice ID")

    proforma = await db.invoices.find_one({"_id": proforma_oid, "issuer_id": owner_id})
    if not proforma:
        raise ValueError("Proforma invoice not found")
    if proforma.get("invoice_stage") not in ("proforma", "advance"):
        raise ValueError("Source invoice is not a proforma or advance invoice")

    now = datetime.utcnow()

    # Determine items & totals
    if adjustments.get("items"):
        from app.schemas.invoice import InvoiceItemSchema
        adj_items = [
            InvoiceItemSchema(**i) if isinstance(i, dict) else i
            for i in adjustments["items"]
        ]
        tax_rate = float(adjustments.get("tax_rate") or proforma.get("tax_rate") or 0.0)
        discount = float(adjustments.get("discount") or proforma.get("discount") or 0.0)
        totals = _calculate_totals(adj_items, tax_rate, discount)
    else:
        tax_rate = float(adjustments.get("tax_rate") or proforma.get("tax_rate") or 0.0)
        discount = float(adjustments.get("discount") or proforma.get("discount") or 0.0)
        # Re-use existing items from the proforma
        existing_items = proforma.get("items", [])
        totals = _calculate_totals(existing_items, tax_rate, discount)

    # Determine due_date
    if adjustments.get("due_date"):
        due = adjustments["due_date"]
        due_date_naive = due.replace(tzinfo=None) if getattr(due, "tzinfo", None) else due
    else:
        due_date_naive = proforma.get("due_date", now)

    new_invoice_number = await generate_invoice_number(owner_id, db)

    doc = {
        "invoice_number": new_invoice_number,
        "invoice_type": proforma.get("invoice_type", "customer"),
        "invoice_stage": "final",
        "issuer_id": owner_id,
        "issuer_details": proforma.get("issuer_details"),
        "recipient_id": proforma.get("recipient_id"),
        "recipient_details": proforma.get("recipient_details"),
        "items": totals["items"],
        "subtotal": totals["subtotal"],
        "tax_rate": tax_rate,
        "tax_amount": totals["tax_amount"],
        "discount": round(discount, 2),
        "total_amount": totals["total_amount"],
        "currency": proforma.get("currency", "INR"),
        "status": "draft",
        "paid_amount": proforma.get("paid_amount", 0.0),
        "payment_records": proforma.get("payment_records", []),
        "issue_date": now,
        "due_date": due_date_naive,
        "paid_date": proforma.get("paid_date"),
        "trip_ids": proforma.get("trip_ids", []),
        "expense_ids": proforma.get("expense_ids", []),
        "notes": adjustments.get("notes") or proforma.get("notes"),
        "terms": adjustments.get("terms") or proforma.get("terms", "Payment due within 30 days"),
        "pdf_url": None,
        "proforma_parent_id": proforma_id,
        "created_by": admin_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.invoices.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Mark linked trips as invoiced
    for tid in proforma.get("trip_ids", []):
        try:
            trip_oid = ObjectId(tid)
            await db.trips.update_one(
                {"_id": trip_oid},
                {"$set": {
                    "is_invoiced": True,
                    "invoice_id": str(result.inserted_id),
                    "updated_at": now,
                }},
            )
        except Exception:
            pass

    return _serialize_doc(doc)
