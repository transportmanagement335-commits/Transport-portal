"""
Report service — aggregates real business data from MongoDB for the
Business Report page.

Data model (single source of truth):
  Revenue  → payments collection (actual money received, by created_at)
  Expenses → expenses collection (actual costs incurred, by date)
  Trips    → trips collection (for trip counts and vehicle/driver analytics)
  Profit   → Revenue − Expenses

This means:
  - Payments entered on the Payments page are included in revenue
  - Expenses entered on the Expenses page are included in costs
  - A user never has to enter data in multiple places
"""
from datetime import datetime, timedelta
from calendar import monthrange
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


# ──────────────────────────────────────────────────────────────────────────────
# Date-range helpers
# ──────────────────────────────────────────────────────────────────────────────

def _parse_range(range_filter: str):
    """
    Return (current_start, current_end, prev_start, prev_end) datetimes.
    Comparison period is the equivalent window immediately before the current one.
    """
    now = datetime.utcnow()
    year = now.year
    month = now.month

    if range_filter == "This Month":
        cur_start = datetime(year, month, 1)
        _, last_day = monthrange(year, month)
        cur_end = datetime(year, month, last_day, 23, 59, 59)
        if month == 1:
            prev_start = datetime(year - 1, 12, 1)
            prev_end = datetime(year - 1, 12, 31, 23, 59, 59)
        else:
            prev_start = datetime(year, month - 1, 1)
            _, prev_last = monthrange(year, month - 1)
            prev_end = datetime(year, month - 1, prev_last, 23, 59, 59)

    elif range_filter == "Last Month":
        if month == 1:
            cur_start = datetime(year - 1, 12, 1)
            cur_end = datetime(year - 1, 12, 31, 23, 59, 59)
            prev_start = datetime(year - 1, 11, 1)
            _, prev_last = monthrange(year - 1, 11)
            prev_end = datetime(year - 1, 11, prev_last, 23, 59, 59)
        else:
            cur_start = datetime(year, month - 1, 1)
            _, last_day = monthrange(year, month - 1)
            cur_end = datetime(year, month - 1, last_day, 23, 59, 59)
            if month == 2:
                prev_start = datetime(year - 1, 12, 1)
                prev_end = datetime(year - 1, 12, 31, 23, 59, 59)
            else:
                prev_start = datetime(year, month - 2, 1)
                _, prev_last = monthrange(year, month - 2)
                prev_end = datetime(year, month - 2, prev_last, 23, 59, 59)

    elif range_filter == "Last 3 Months":
        # Current: 3 full months back to end of last month
        if month == 1:
            cur_end = datetime(year - 1, 12, 31, 23, 59, 59)
            cur_start = datetime(year - 1, 10, 1)
            prev_start = datetime(year - 1, 7, 1)
            prev_end = datetime(year - 1, 9, 30, 23, 59, 59)
        else:
            # end of last month
            last_m = month - 1 if month > 1 else 12
            last_y = year if month > 1 else year - 1
            _, last_day = monthrange(last_y, last_m)
            cur_end = datetime(last_y, last_m, last_day, 23, 59, 59)
            # start 3 months before that
            start_m = last_m - 2
            start_y = last_y
            if start_m <= 0:
                start_m += 12
                start_y -= 1
            cur_start = datetime(start_y, start_m, 1)
            # prev period = 3 months before cur_start
            prev_end = cur_start - timedelta(seconds=1)
            prev_m = start_m - 3
            prev_y = start_y
            if prev_m <= 0:
                prev_m += 12
                prev_y -= 1
            prev_start = datetime(prev_y, prev_m, 1)

    elif range_filter == "This Year":
        cur_start = datetime(year, 1, 1)
        cur_end = datetime(year, 12, 31, 23, 59, 59)
        prev_start = datetime(year - 1, 1, 1)
        prev_end = datetime(year - 1, 12, 31, 23, 59, 59)

    else:
        # Default: This Month
        cur_start = datetime(year, month, 1)
        _, last_day = monthrange(year, month)
        cur_end = datetime(year, month, last_day, 23, 59, 59)
        if month == 1:
            prev_start = datetime(year - 1, 12, 1)
            prev_end = datetime(year - 1, 12, 31, 23, 59, 59)
        else:
            prev_start = datetime(year, month - 1, 1)
            _, prev_last = monthrange(year, month - 1)
            prev_end = datetime(year, month - 1, prev_last, 23, 59, 59)

    return cur_start, cur_end, prev_start, prev_end


def _pct_change(current: float, previous: float) -> Optional[float]:
    """Percentage change vs previous period. Returns None if previous is 0."""
    if previous == 0:
        return None
    return round(((current - previous) / abs(previous)) * 100, 1)


MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ──────────────────────────────────────────────────────────────────────────────
# Revenue: payments collection (actual money received)
# ──────────────────────────────────────────────────────────────────────────────

async def _sum_revenue(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> float:
    """
    Total revenue = sum of all payments received in the date window.
    Uses payments.created_at as the date field.
    """
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "created_at": {"$gte": start, "$lte": end},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    result = await db.payments.aggregate(pipeline).to_list(length=1)
    return float(result[0]["total"]) if result else 0.0


# ──────────────────────────────────────────────────────────────────────────────
# Expenses: expenses collection
# ──────────────────────────────────────────────────────────────────────────────

async def _sum_expenses(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> float:
    """
    Total expenses = sum of all expense entries in the date window.
    Uses expenses.date as the authoritative date; falls back to created_at if date is null.
    Uses $addFields to pick one date per document — no double-counting.
    """
    pipeline = [
        {"$match": {"owner_id": owner_id}},
        {"$addFields": {"eff_date": {"$ifNull": ["$date", "$created_at"]}}},
        {"$match": {"eff_date": {"$gte": start, "$lte": end}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    result = await db.expenses.aggregate(pipeline).to_list(length=1)
    return float(result[0]["total"]) if result else 0.0


# ──────────────────────────────────────────────────────────────────────────────
# Trip counts: trips collection
# ──────────────────────────────────────────────────────────────────────────────

async def _count_trips(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> int:
    """
    Count trips in the period. Uses reporting_time first, falls back to created_at.
    Counts all trips (not just completed) to represent business volume.
    """
    return await db.trips.count_documents({
        "owner_id": owner_id,
        "$or": [
            {"reporting_time": {"$gte": start, "$lte": end}},
            {"created_at": {"$gte": start, "$lte": end}},
        ],
    })


# ──────────────────────────────────────────────────────────────────────────────
# Monthly trend: by calendar month across the selected range
# ──────────────────────────────────────────────────────────────────────────────

async def _monthly_trend(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> list:
    """
    Monthly breakdown of revenue (from payments), expenses, and profit.
    Each entry = {month, revenue, expense, profit}.
    """
    # Revenue by month (from payments.created_at)
    rev_pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "created_at": {"$gte": start, "$lte": end},
        }},
        {"$group": {
            "_id": {
                "year": {"$year": "$created_at"},
                "month": {"$month": "$created_at"},
            },
            "total": {"$sum": "$amount"},
        }},
    ]
    rev_docs = await db.payments.aggregate(rev_pipeline).to_list(length=24)
    rev_map = {(d["_id"]["year"], d["_id"]["month"]): d["total"] for d in rev_docs}

    # Expenses by month (from expenses.date or created_at)
    exp_pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "$or": [
                {"date": {"$gte": start, "$lte": end}},
                {"created_at": {"$gte": start, "$lte": end}},
            ],
        }},
        {"$addFields": {
            "eff_date": {"$ifNull": ["$date", "$created_at"]},
        }},
        {"$group": {
            "_id": {
                "year": {"$year": "$eff_date"},
                "month": {"$month": "$eff_date"},
            },
            "total": {"$sum": "$amount"},
        }},
    ]
    exp_docs = await db.expenses.aggregate(exp_pipeline).to_list(length=24)
    exp_map = {(d["_id"]["year"], d["_id"]["month"]): d["total"] for d in exp_docs}

    # Build month-by-month array
    trend = []
    y, m = start.year, start.month
    end_key = (end.year, end.month)
    while (y, m) <= end_key:
        rev = round(rev_map.get((y, m), 0), 2)
        exp = round(exp_map.get((y, m), 0), 2)
        trend.append({
            "month": MONTH_LABELS[m - 1],
            "revenue": rev,
            "expense": exp,
            "profit": round(rev - exp, 2),
        })
        m += 1
        if m > 12:
            m = 1
            y += 1

    return trend


# ──────────────────────────────────────────────────────────────────────────────
# Top Clients: from payments collection (actual revenue per client)
# ──────────────────────────────────────────────────────────────────────────────

async def _top_clients(
    owner_id: str,
    cur_start: datetime,
    cur_end: datetime,
    prev_start: datetime,
    prev_end: datetime,
    db: AsyncIOMotorDatabase,
    limit: int = 5,
) -> list:
    """Top clients ranked by actual payments received in the current period."""
    # Current period: group payments by client_name
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "created_at": {"$gte": cur_start, "$lte": cur_end},
        }},
        {"$group": {
            "_id": "$client_name",
            "revenue": {"$sum": "$amount"},
            "transactions": {"$sum": 1},
        }},
        {"$sort": {"revenue": -1}},
        {"$limit": limit},
    ]
    cur_docs = await db.payments.aggregate(pipeline).to_list(length=limit)

    # Previous period revenue per client (for growth calc)
    prev_pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "created_at": {"$gte": prev_start, "$lte": prev_end},
        }},
        {"$group": {
            "_id": "$client_name",
            "revenue": {"$sum": "$amount"},
        }},
    ]
    prev_docs = await db.payments.aggregate(prev_pipeline).to_list(length=100)
    prev_map = {d["_id"]: d["revenue"] for d in prev_docs}

    # Count trips per client in current period
    trip_pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "$or": [
                {"reporting_time": {"$gte": cur_start, "$lte": cur_end}},
                {"created_at": {"$gte": cur_start, "$lte": cur_end}},
            ],
        }},
        {"$group": {
            "_id": "$client_name",
            "trips": {"$sum": 1},
        }},
    ]
    trip_docs = await db.trips.aggregate(trip_pipeline).to_list(length=100)
    trips_map = {d["_id"]: d["trips"] for d in trip_docs}

    # Get expenses linked to each client's trips
    results = []
    for c in cur_docs:
        name = c["_id"] or "Unknown Client"
        revenue = round(c["revenue"], 2)
        trips = trips_map.get(name, 0)

        # Find trip_ids for this client to get related expenses
        trip_ids_list = []
        async for t in db.trips.find(
            {"owner_id": owner_id, "client_name": name,
             "$or": [
                 {"reporting_time": {"$gte": cur_start, "$lte": cur_end}},
                 {"created_at": {"$gte": cur_start, "$lte": cur_end}},
             ]},
            {"_id": 1},
        ):
            trip_ids_list.append(str(t["_id"]))

        expense = 0.0
        if trip_ids_list:
            exp_result = await db.expenses.aggregate([
                {"$match": {"owner_id": owner_id, "trip_id": {"$in": trip_ids_list}}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
            ]).to_list(length=1)
            expense = float(exp_result[0]["total"]) if exp_result else 0.0

        profit = round(revenue - expense, 2)
        prev_rev = prev_map.get(name, 0)
        growth = _pct_change(revenue, prev_rev)

        results.append({
            "name": name,
            "trips": trips,
            "revenue": revenue,
            "profit": profit,
            "growth": growth if growth is not None else 0,
        })

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Top Vehicles: from trips + payments linked by trip_id
# ──────────────────────────────────────────────────────────────────────────────

async def _top_vehicles(
    owner_id: str,
    cur_start: datetime,
    cur_end: datetime,
    db: AsyncIOMotorDatabase,
    limit: int = 5,
) -> list:
    """Top vehicles ranked by revenue (from payments linked to their trips)."""
    # Get trips in the period grouped by vehicle
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "$or": [
                {"reporting_time": {"$gte": cur_start, "$lte": cur_end}},
                {"created_at": {"$gte": cur_start, "$lte": cur_end}},
            ],
        }},
        {"$group": {
            "_id": "$vehicle_number",
            "vehicle_id": {"$first": "$vehicle_id"},
            "trips": {"$sum": 1},
            "trip_ids": {"$push": {"$toString": "$_id"}},
            # Use trip_cost as proxy revenue per vehicle (payments are per client, not vehicle)
            "revenue": {"$sum": {
                "$cond": [
                    {"$gt": [{"$ifNull": ["$trip_cost", 0]}, 0]},
                    "$trip_cost",
                    {"$add": [
                        {"$ifNull": ["$balance_amount", 0]},
                        {"$ifNull": ["$amount_paid", 0]},
                    ]},
                ],
            }},
        }},
        {"$sort": {"revenue": -1}},
        {"$limit": limit},
    ]
    docs = await db.trips.aggregate(pipeline).to_list(length=limit)

    total_days = max((cur_end - cur_start).days, 1)

    results = []
    for v in docs:
        vehicle_no = v["_id"] or "Unknown"
        revenue = round(float(v["revenue"]), 2)
        trip_ids_list = v.get("trip_ids", [])

        # Expenses for this vehicle in the period
        vid = v.get("vehicle_id", "")
        exp_result = await db.expenses.aggregate([
            {"$match": {
                "owner_id": owner_id,
                "vehicle_id": vid,
                "$or": [
                    {"date": {"$gte": cur_start, "$lte": cur_end}},
                    {"created_at": {"$gte": cur_start, "$lte": cur_end}},
                ],
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(length=1)
        expense = float(exp_result[0]["total"]) if exp_result else 0.0
        profit = round(revenue - expense, 2)

        utilization = min(round((v["trips"] / total_days) * 100, 1), 100)

        results.append({
            "vehicleNo": vehicle_no,
            "trips": v["trips"],
            "revenue": revenue,
            "profit": profit,
            "utilization": utilization,
        })

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Top Drivers: from trips collection
# ──────────────────────────────────────────────────────────────────────────────

async def _top_drivers(
    owner_id: str,
    cur_start: datetime,
    cur_end: datetime,
    db: AsyncIOMotorDatabase,
    limit: int = 5,
) -> list:
    """Top drivers ranked by trip count in the current period."""
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "$or": [
                {"reporting_time": {"$gte": cur_start, "$lte": cur_end}},
                {"created_at": {"$gte": cur_start, "$lte": cur_end}},
            ],
        }},
        {"$group": {
            "_id": "$driver_name",
            "driver_id": {"$first": "$driver_id"},
            "trips": {"$sum": 1},
            "revenue": {"$sum": {
                "$cond": [
                    {"$gt": [{"$ifNull": ["$trip_cost", 0]}, 0]},
                    "$trip_cost",
                    {"$add": [
                        {"$ifNull": ["$balance_amount", 0]},
                        {"$ifNull": ["$amount_paid", 0]},
                    ]},
                ],
            }},
            "kmDriven": {"$sum": {"$ifNull": ["$distance_travelled_km", 0]}},
        }},
        {"$sort": {"trips": -1}},
        {"$limit": limit},
    ]
    docs = await db.trips.aggregate(pipeline).to_list(length=limit)

    results = []
    for d in docs:
        total_trips = d["trips"]
        driver_id = d.get("driver_id")
        rating = None
        if total_trips > 0 and driver_id:
            completed = await db.trips.count_documents({
                "owner_id": owner_id,
                "driver_id": driver_id,
                "trip_status": "Completed",
                "$or": [
                    {"reporting_time": {"$gte": cur_start, "$lte": cur_end}},
                    {"created_at": {"$gte": cur_start, "$lte": cur_end}},
                ],
            })
            rating = round(min((completed / total_trips) * 5, 5), 1)

        results.append({
            "name": d["_id"] or "Unknown Driver",
            "trips": total_trips,
            "kmDriven": round(float(d.get("kmDriven", 0) or 0), 1),
            "revenue": round(float(d["revenue"]), 2),
            "rating": rating,
        })

    return results


# ──────────────────────────────────────────────────────────────────────────────
# AI Insights
# ──────────────────────────────────────────────────────────────────────────────

def _generate_insights(
    kpi: dict,
    top_clients: list,
    top_vehicles: list,
    top_drivers: list,
    cur_revenue: float,
    cur_expense: float,
    cur_profit: float,
) -> list:
    """Generate contextual AI-style business insights from computed KPI data."""
    insights = []

    # Revenue trend
    rev_trend = kpi.get("revenueTrend")
    if rev_trend is not None:
        if rev_trend > 10:
            insights.append({"text": f"📈 Revenue is <b>up {rev_trend}%</b> compared to the previous period — strong growth momentum!", "type": "success"})
        elif rev_trend > 0:
            insights.append({"text": f"📈 Revenue grew by <b>{rev_trend}%</b> vs the previous period — steady progress.", "type": "success"})
        elif rev_trend < -10:
            insights.append({"text": f"📉 Revenue <b>declined {abs(rev_trend)}%</b>. Review client acquisition and pricing strategies.", "type": "warning"})
        elif rev_trend < 0:
            insights.append({"text": f"📉 Revenue dipped <b>{abs(rev_trend)}%</b> from the previous period. Monitor closely.", "type": "warning"})

    # Profit margin
    margin = kpi.get("profitMargin")
    if margin is not None:
        if margin >= 30:
            insights.append({"text": f"💰 Profit margin is a healthy <b>{margin}%</b> — operations running efficiently.", "type": "success"})
        elif margin >= 10:
            insights.append({"text": f"💰 Profit margin is <b>{margin}%</b> — decent, but look for cost optimizations.", "type": "info"})
        elif margin >= 0:
            insights.append({"text": f"⚠️ Profit margin is only <b>{margin}%</b> — review fuel, driver payments, and maintenance costs.", "type": "warning"})
        else:
            insights.append({"text": f"🚨 Operating at a <b>loss</b> (margin: {margin}%). Urgent cost review needed.", "type": "warning"})

    # Expense spike
    exp_trend = kpi.get("expenseTrend")
    if exp_trend is not None and exp_trend > 15:
        insights.append({"text": f"🔥 Expenses <b>increased {exp_trend}%</b> — check for spikes in fuel, tolls, or repairs.", "type": "warning"})

    # Client concentration
    if top_clients and cur_revenue > 0:
        top_rev = top_clients[0].get("revenue", 0)
        concentration = round((top_rev / cur_revenue) * 100, 1)
        if concentration > 50:
            insights.append({"text": f"👤 <b>{top_clients[0]['name']}</b> contributes <b>{concentration}%</b> of revenue. High concentration risk — diversify.", "type": "warning"})
        elif concentration > 25 and len(top_clients) >= 2:
            insights.append({"text": f"👥 <b>{top_clients[0]['name']}</b> and <b>{top_clients[1]['name']}</b> are your highest revenue clients.", "type": "info"})

    # Fleet utilization
    if top_vehicles:
        avg_util = sum(v.get("utilization", 0) for v in top_vehicles) / len(top_vehicles)
        if avg_util < 30:
            insights.append({"text": f"🚛 Fleet utilization is only <b>{round(avg_util, 1)}%</b> — consider reducing idle vehicles or acquiring more clients.", "type": "warning"})
        elif avg_util > 70:
            insights.append({"text": f"🚛 Fleet utilization at <b>{round(avg_util, 1)}%</b> — vehicles are well-deployed!", "type": "success"})

    # Top driver
    if top_drivers:
        d = top_drivers[0]
        if d.get("trips", 0) > 0:
            insights.append({"text": f"🚗 <b>{d['name']}</b> leads with <b>{d['trips']}</b> trips this period.", "type": "info"})

    # Trip growth
    trips_trend = kpi.get("tripsTrend")
    if trips_trend is not None and trips_trend > 20:
        insights.append({"text": f"📊 Trip volume grew <b>{trips_trend}%</b> — business is scaling well!", "type": "success"})

    if cur_revenue == 0 and cur_expense == 0:
        insights.append({"text": "📊 No payments or expenses recorded in this period. Make sure to log trips, receive payments, and record expenses.", "type": "info"})
    elif not insights:
        insights.append({"text": "📊 Business is stable this period. Keep logging trips and expenses for richer trend insights.", "type": "info"})

    return insights


# ──────────────────────────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────────────────────────

async def get_business_report(owner_id: str, range_filter: str, db: AsyncIOMotorDatabase) -> dict:
    """
    Build the complete business report for BusinessReport.jsx.

    Revenue  = payments.amount (actual cash/UPI received)
    Expenses = expenses.amount (fuel, tolls, repairs, driver pay, etc.)
    Profit   = Revenue - Expenses
    Trips    = count of trips in the period (for KPI and analytics)
    """
    cur_start, cur_end, prev_start, prev_end = _parse_range(range_filter)

    # ── Current period ──────────────────────────────────────────────────────
    cur_revenue = await _sum_revenue(owner_id, cur_start, cur_end, db)
    cur_expense = await _sum_expenses(owner_id, cur_start, cur_end, db)
    cur_profit = cur_revenue - cur_expense
    cur_trips = await _count_trips(owner_id, cur_start, cur_end, db)
    cur_margin = round((cur_profit / cur_revenue) * 100, 1) if cur_revenue > 0 else 0

    # ── Previous period ─────────────────────────────────────────────────────
    prev_revenue = await _sum_revenue(owner_id, prev_start, prev_end, db)
    prev_expense = await _sum_expenses(owner_id, prev_start, prev_end, db)
    prev_profit = prev_revenue - prev_expense
    prev_trips = await _count_trips(owner_id, prev_start, prev_end, db)
    prev_margin = round((prev_profit / prev_revenue) * 100, 1) if prev_revenue > 0 else 0

    kpi = {
        "totalRevenue": round(cur_revenue, 2),
        "revenueTrend": _pct_change(cur_revenue, prev_revenue),
        "totalExpense": round(cur_expense, 2),
        "expenseTrend": _pct_change(cur_expense, prev_expense),
        "totalProfit": round(cur_profit, 2),
        "profitTrend": _pct_change(cur_profit, prev_profit) if prev_profit != 0 else None,
        "tripsCompleted": cur_trips,
        "tripsTrend": _pct_change(cur_trips, prev_trips),
        "profitMargin": cur_margin,
        "marginTrend": _pct_change(cur_margin, prev_margin) if prev_margin != 0 else None,
    }

    # ── Monthly trend chart ─────────────────────────────────────────────────
    trend = await _monthly_trend(owner_id, cur_start, cur_end, db)

    # ── Top performers ──────────────────────────────────────────────────────
    clients = await _top_clients(owner_id, cur_start, cur_end, prev_start, prev_end, db)
    vehicles = await _top_vehicles(owner_id, cur_start, cur_end, db)
    drivers = await _top_drivers(owner_id, cur_start, cur_end, db)

    # ── AI insights ─────────────────────────────────────────────────────────
    ai_insights = _generate_insights(kpi, clients, vehicles, drivers, cur_revenue, cur_expense, cur_profit)

    return {
        "kpi": kpi,
        "trend": trend,
        "aiInsights": ai_insights,
        "topClients": clients,
        "topVehicles": vehicles,
        "topDrivers": drivers,
    }
