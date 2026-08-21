"""
Report service — aggregates real business data from MongoDB for the
Business Report page.

Computes:
  • KPI cards (revenue, expense, profit, trips, margin — with month-over-month trends)
  • Monthly trend chart data (revenue, expense, profit per month)
  • Top-performing clients, vehicles, and drivers
  • AI-generated business insights
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
    Return (current_start, current_end, prev_start, prev_end) datetimes
    for the selected date range.
    """
    now = datetime.utcnow()
    year = now.year
    month = now.month

    if range_filter == "This Month":
        cur_start = datetime(year, month, 1)
        _, last_day = monthrange(year, month)
        cur_end = datetime(year, month, last_day, 23, 59, 59)
        # Previous month
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
        cur_end = datetime(year, month, monthrange(year, month)[1], 23, 59, 59)
        # Go back 3 months
        m = month - 2
        y = year
        if m <= 0:
            m += 12
            y -= 1
        cur_start = datetime(y, m, 1)
        # Previous 3-month window
        m2 = m - 3
        y2 = y
        if m2 <= 0:
            m2 += 12
            y2 -= 1
        prev_start = datetime(y2, m2, 1)
        prev_end = cur_start - timedelta(seconds=1)

    elif range_filter == "This Year":
        cur_start = datetime(year, 1, 1)
        cur_end = datetime(year, 12, 31, 23, 59, 59)
        prev_start = datetime(year - 1, 1, 1)
        prev_end = datetime(year - 1, 12, 31, 23, 59, 59)

    else:
        # Default to This Month
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
    """Compute percentage change, returning None if previous is zero."""
    if previous == 0:
        return None
    return round(((current - previous) / abs(previous)) * 100, 1)


MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


# ──────────────────────────────────────────────────────────────────────────────
# Core aggregation
# ──────────────────────────────────────────────────────────────────────────────

async def _sum_trip_revenue(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> float:
    """Sum trip_cost for all trips in the date range.
    Uses reporting_time as the canonical date for a trip.
    Falls back to trip_cost first, then balance_amount + amount_paid.
    """
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "reporting_time": {"$gte": start, "$lte": end},
        }},
        {"$group": {
            "_id": None,
            "total": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$ne": [{"$type": "$trip_cost"}, "missing"]},
                        {"$gt": ["$trip_cost", 0]},
                    ]},
                    "$trip_cost",
                    {"$add": [
                        {"$ifNull": ["$balance_amount", 0]},
                        {"$ifNull": ["$amount_paid", 0]},
                    ]},
                ],
            }},
        }},
    ]
    result = await db.trips.aggregate(pipeline).to_list(length=1)
    return result[0]["total"] if result else 0.0


async def _sum_expenses(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> float:
    """Sum expense amounts in the date range."""
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "date": {"$gte": start, "$lte": end},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    result = await db.expenses.aggregate(pipeline).to_list(length=1)
    return result[0]["total"] if result else 0.0


async def _count_completed_trips(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> int:
    """Count completed trips in the date range."""
    return await db.trips.count_documents({
        "owner_id": owner_id,
        "reporting_time": {"$gte": start, "$lte": end},
        "trip_status": {"$in": ["Completed", "On Trip", "Scheduled"]},
    })


# ──────────────────────────────────────────────────────────────────────────────
# Monthly trend data
# ──────────────────────────────────────────────────────────────────────────────

async def _monthly_trend(owner_id: str, start: datetime, end: datetime, db: AsyncIOMotorDatabase) -> list:
    """
    Build monthly revenue / expense / profit array for the line chart.
    Returns list of {month, revenue, expense, profit}.
    """
    # Revenue by month
    rev_pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "reporting_time": {"$gte": start, "$lte": end},
        }},
        {"$group": {
            "_id": {"$month": "$reporting_time"},
            "total": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$ne": [{"$type": "$trip_cost"}, "missing"]},
                        {"$gt": ["$trip_cost", 0]},
                    ]},
                    "$trip_cost",
                    {"$add": [
                        {"$ifNull": ["$balance_amount", 0]},
                        {"$ifNull": ["$amount_paid", 0]},
                    ]},
                ],
            }},
        }},
    ]
    rev_docs = await db.trips.aggregate(rev_pipeline).to_list(length=12)
    rev_map = {d["_id"]: d["total"] for d in rev_docs}

    # Expenses by month
    exp_pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "date": {"$gte": start, "$lte": end},
        }},
        {"$group": {
            "_id": {"$month": "$date"},
            "total": {"$sum": "$amount"},
        }},
    ]
    exp_docs = await db.expenses.aggregate(exp_pipeline).to_list(length=12)
    exp_map = {d["_id"]: d["total"] for d in exp_docs}

    # Build array for every month in the range
    start_month = start.month
    start_year = start.year
    end_month = end.month
    end_year = end.year

    trend = []
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        rev = round(rev_map.get(m, 0), 2)
        exp = round(exp_map.get(m, 0), 2)
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
# Top performers
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
    """Top clients ranked by revenue in the current period."""
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "reporting_time": {"$gte": cur_start, "$lte": cur_end},
        }},
        {"$group": {
            "_id": "$client_name",
            "trips": {"$sum": 1},
            "revenue": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$ne": [{"$type": "$trip_cost"}, "missing"]},
                        {"$gt": ["$trip_cost", 0]},
                    ]},
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
    cur_docs = await db.trips.aggregate(pipeline).to_list(length=limit)

    # Get previous period revenues for growth calculation
    prev_pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "reporting_time": {"$gte": prev_start, "$lte": prev_end},
        }},
        {"$group": {
            "_id": "$client_name",
            "revenue": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$ne": [{"$type": "$trip_cost"}, "missing"]},
                        {"$gt": ["$trip_cost", 0]},
                    ]},
                    "$trip_cost",
                    {"$add": [
                        {"$ifNull": ["$balance_amount", 0]},
                        {"$ifNull": ["$amount_paid", 0]},
                    ]},
                ],
            }},
        }},
    ]
    prev_docs = await db.trips.aggregate(prev_pipeline).to_list(length=100)
    prev_map = {d["_id"]: d["revenue"] for d in prev_docs}

    # Get expenses per client (using trip_id linkage)
    client_expenses = {}
    for c in cur_docs:
        client_name = c["_id"]
        # Find trip IDs for this client
        trip_ids_cursor = db.trips.find(
            {
                "owner_id": owner_id,
                "client_name": client_name,
                "reporting_time": {"$gte": cur_start, "$lte": cur_end},
            },
            {"_id": 1},
        )
        trip_ids = []
        async for t in trip_ids_cursor:
            trip_ids.append(str(t["_id"]))

        if trip_ids:
            exp_result = await db.expenses.aggregate([
                {"$match": {"owner_id": owner_id, "trip_id": {"$in": trip_ids}}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
            ]).to_list(length=1)
            client_expenses[client_name] = exp_result[0]["total"] if exp_result else 0
        else:
            client_expenses[client_name] = 0

    results = []
    for c in cur_docs:
        name = c["_id"]
        revenue = round(c["revenue"], 2)
        expense = round(client_expenses.get(name, 0), 2)
        profit = round(revenue - expense, 2)
        prev_rev = prev_map.get(name, 0)
        growth = _pct_change(revenue, prev_rev)
        results.append({
            "name": name or "Unknown Client",
            "trips": c["trips"],
            "revenue": revenue,
            "profit": profit,
            "growth": growth if growth is not None else 0,
        })

    return results


async def _top_vehicles(
    owner_id: str,
    cur_start: datetime,
    cur_end: datetime,
    db: AsyncIOMotorDatabase,
    limit: int = 5,
) -> list:
    """Top vehicles ranked by revenue in the current period."""
    pipeline = [
        {"$match": {
            "owner_id": owner_id,
            "reporting_time": {"$gte": cur_start, "$lte": cur_end},
        }},
        {"$group": {
            "_id": "$vehicle_number",
            "vehicle_id": {"$first": "$vehicle_id"},
            "trips": {"$sum": 1},
            "revenue": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$ne": [{"$type": "$trip_cost"}, "missing"]},
                        {"$gt": ["$trip_cost", 0]},
                    ]},
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

    # Total trips in the period for utilization calculation
    total_days = max((cur_end - cur_start).days, 1)

    results = []
    for v in docs:
        vehicle_no = v["_id"]
        revenue = round(v["revenue"], 2)

        # Compute expenses for this vehicle in the period
        exp_result = await db.expenses.aggregate([
            {"$match": {
                "owner_id": owner_id,
                "vehicle_id": v.get("vehicle_id", ""),
                "date": {"$gte": cur_start, "$lte": cur_end},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(length=1)
        expense = exp_result[0]["total"] if exp_result else 0
        profit = round(revenue - expense, 2)

        # Utilization: (trip_days / total_days) * 100
        # Approximate each trip as 1 day (or use actual started_at/completed_at if available)
        utilization = min(round((v["trips"] / total_days) * 100, 1), 100)

        results.append({
            "vehicleNo": vehicle_no or "Unknown",
            "trips": v["trips"],
            "revenue": revenue,
            "profit": profit,
            "utilization": utilization,
        })

    return results


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
            "reporting_time": {"$gte": cur_start, "$lte": cur_end},
        }},
        {"$group": {
            "_id": "$driver_name",
            "driver_id": {"$first": "$driver_id"},
            "trips": {"$sum": 1},
            "revenue": {"$sum": {
                "$cond": [
                    {"$and": [
                        {"$ne": [{"$type": "$trip_cost"}, "missing"]},
                        {"$gt": ["$trip_cost", 0]},
                    ]},
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
        revenue = round(d["revenue"], 2)
        km = round(d.get("kmDriven", 0), 1)

        # Compute rating as a performance score:
        # Trips completed on-time / total trips (simple proxy)
        # Since we don't have explicit ratings, derive one from completion ratio
        total_trips = d["trips"]
        if total_trips > 0 and d.get("driver_id"):
            completed = await db.trips.count_documents({
                "owner_id": owner_id,
                "driver_id": d["driver_id"],
                "trip_status": "Completed",
                "reporting_time": {"$gte": cur_start, "$lte": cur_end},
            })
            rating = round(min((completed / total_trips) * 5, 5), 1)
        else:
            rating = None

        results.append({
            "name": d["_id"] or "Unknown Driver",
            "trips": total_trips,
            "kmDriven": km,
            "revenue": revenue,
            "rating": rating,
        })

    return results


# ──────────────────────────────────────────────────────────────────────────────
# AI Insights generator
# ──────────────────────────────────────────────────────────────────────────────

def _generate_insights(
    kpi: dict,
    top_clients: list,
    top_vehicles: list,
    top_drivers: list,
    cur_revenue: float,
    cur_expense: float,
    cur_profit: float,
    range_filter: str,
) -> list:
    """
    Generate smart AI-style business insights based on the computed data.
    Returns a list of {text: str, type: 'success'|'warning'|'info'}.
    """
    insights = []

    # ── Revenue insight ────────────────────────────────────────────────────────
    rev_trend = kpi.get("revenueTrend")
    if rev_trend is not None:
        if rev_trend > 10:
            insights.append({
                "text": f"📈 Revenue is <b>up {rev_trend}%</b> compared to the previous period — strong growth momentum!",
                "type": "success",
            })
        elif rev_trend > 0:
            insights.append({
                "text": f"📈 Revenue grew by <b>{rev_trend}%</b> compared to the previous period — steady progress.",
                "type": "success",
            })
        elif rev_trend < -10:
            insights.append({
                "text": f"📉 Revenue has <b>declined {abs(rev_trend)}%</b> compared to the previous period. Consider reviewing pricing and client acquisition strategies.",
                "type": "warning",
            })
        elif rev_trend < 0:
            insights.append({
                "text": f"📉 Revenue dipped <b>{abs(rev_trend)}%</b> from the previous period. Monitor closely over the next period.",
                "type": "warning",
            })

    # ── Profit margin insight ──────────────────────────────────────────────────
    margin = kpi.get("profitMargin")
    if margin is not None:
        if margin >= 30:
            insights.append({
                "text": f"💰 Profit margin is a healthy <b>{margin}%</b> — your operations are running efficiently.",
                "type": "success",
            })
        elif margin >= 15:
            insights.append({
                "text": f"💰 Profit margin is <b>{margin}%</b> — decent, but look for cost optimization opportunities.",
                "type": "info",
            })
        elif margin >= 0:
            insights.append({
                "text": f"⚠️ Profit margin is only <b>{margin}%</b> — expenses are eating into your revenue. Review fuel, driver payments, and maintenance costs.",
                "type": "warning",
            })
        else:
            insights.append({
                "text": f"🚨 You are operating at a <b>loss</b> (margin: {margin}%). Urgent cost review needed.",
                "type": "warning",
            })

    # ── Expense trend insight ──────────────────────────────────────────────────
    exp_trend = kpi.get("expenseTrend")
    if exp_trend is not None and exp_trend > 15:
        insights.append({
            "text": f"🔥 Expenses have <b>increased {exp_trend}%</b> — check for unusual spikes in fuel, tolls, or repair costs.",
            "type": "warning",
        })

    # ── Top client concentration ───────────────────────────────────────────────
    if top_clients and cur_revenue > 0:
        top_client_rev = top_clients[0].get("revenue", 0)
        concentration = round((top_client_rev / cur_revenue) * 100, 1)
        if concentration > 50:
            insights.append({
                "text": f"👤 <b>{top_clients[0]['name']}</b> contributes <b>{concentration}%</b> of your revenue. High client concentration is a risk — consider diversifying.",
                "type": "warning",
            })
        elif concentration > 25 and len(top_clients) >= 2:
            insights.append({
                "text": f"👥 Your top 2 clients (<b>{top_clients[0]['name']}</b> and <b>{top_clients[1]['name']}</b>) drive the majority of your business.",
                "type": "info",
            })

    # ── Fleet utilization insight ──────────────────────────────────────────────
    if top_vehicles:
        avg_util = sum(v.get("utilization", 0) for v in top_vehicles) / len(top_vehicles)
        if avg_util < 30:
            insights.append({
                "text": f"🚛 Average fleet utilization is only <b>{round(avg_util, 1)}%</b>. Consider reducing idle vehicles or finding more clients.",
                "type": "warning",
            })
        elif avg_util > 75:
            insights.append({
                "text": f"🚛 Fleet utilization is at <b>{round(avg_util, 1)}%</b> — your vehicles are well-deployed!",
                "type": "success",
            })

    # ── Driver performance insight ─────────────────────────────────────────────
    if top_drivers:
        top_driver = top_drivers[0]
        if top_driver.get("rating") and top_driver["rating"] >= 4.5:
            insights.append({
                "text": f"⭐ <b>{top_driver['name']}</b> is your top performer with <b>{top_driver['trips']}</b> trips and a <b>{top_driver['rating']}</b> rating.",
                "type": "success",
            })
        elif top_driver.get("trips", 0) > 0:
            insights.append({
                "text": f"🚗 <b>{top_driver['name']}</b> leads with <b>{top_driver['trips']}</b> trips this period.",
                "type": "info",
            })

    # ── Trip growth insight ────────────────────────────────────────────────────
    trips_trend = kpi.get("tripsTrend")
    if trips_trend is not None and trips_trend > 20:
        insights.append({
            "text": f"📊 Trip volume has <b>grown {trips_trend}%</b> — your business is scaling well!",
            "type": "success",
        })

    # Fallback if no insights
    if not insights:
        insights.append({
            "text": "📊 Not enough historical data to generate insights for this period. Keep logging trips and expenses for richer analytics.",
            "type": "info",
        })

    return insights


# ──────────────────────────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────────────────────────

async def get_business_report(owner_id: str, range_filter: str, db: AsyncIOMotorDatabase) -> dict:
    """
    Build the complete business report response expected by BusinessReport.jsx.

    Response shape:
    {
        kpi: { totalRevenue, revenueTrend, totalExpense, expenseTrend,
               totalProfit, profitTrend, tripsCompleted, tripsTrend,
               profitMargin, marginTrend },
        trend: [ { month, revenue, expense, profit }, ... ],
        aiInsights: [ { text, type }, ... ],
        topClients: [ { name, trips, revenue, profit, growth }, ... ],
        topVehicles: [ { vehicleNo, trips, revenue, profit, utilization }, ... ],
        topDrivers: [ { name, trips, kmDriven, revenue, rating }, ... ],
    }
    """
    cur_start, cur_end, prev_start, prev_end = _parse_range(range_filter)

    # ── Current period KPIs ────────────────────────────────────────────────────
    cur_revenue = await _sum_trip_revenue(owner_id, cur_start, cur_end, db)
    cur_expense = await _sum_expenses(owner_id, cur_start, cur_end, db)
    cur_profit = cur_revenue - cur_expense
    cur_trips = await _count_completed_trips(owner_id, cur_start, cur_end, db)
    cur_margin = round((cur_profit / cur_revenue) * 100, 1) if cur_revenue > 0 else 0

    # ── Previous period KPIs ───────────────────────────────────────────────────
    prev_revenue = await _sum_trip_revenue(owner_id, prev_start, prev_end, db)
    prev_expense = await _sum_expenses(owner_id, prev_start, prev_end, db)
    prev_profit = prev_revenue - prev_expense
    prev_trips = await _count_completed_trips(owner_id, prev_start, prev_end, db)
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

    # ── Monthly trend ──────────────────────────────────────────────────────────
    trend = await _monthly_trend(owner_id, cur_start, cur_end, db)

    # ── Top performers ─────────────────────────────────────────────────────────
    clients = await _top_clients(owner_id, cur_start, cur_end, prev_start, prev_end, db)
    vehicles = await _top_vehicles(owner_id, cur_start, cur_end, db)
    drivers = await _top_drivers(owner_id, cur_start, cur_end, db)

    # ── AI insights ────────────────────────────────────────────────────────────
    ai_insights = _generate_insights(
        kpi, clients, vehicles, drivers,
        cur_revenue, cur_expense, cur_profit,
        range_filter,
    )

    return {
        "kpi": kpi,
        "trend": trend,
        "aiInsights": ai_insights,
        "topClients": clients,
        "topVehicles": vehicles,
        "topDrivers": drivers,
    }
