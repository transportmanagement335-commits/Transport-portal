"""
Admin routes — dashboard stats and activity feed.

Route summary:
  GET /api/admin/stats           → { total_vehicles, active_drivers, trips_today, pending_documents }
  GET /api/admin/recent-activity → last 10 vehicle + driver activity rows
"""
from fastapi import APIRouter, Depends

from app.database import get_database
from app.models.user import UserRole
from app.routes.auth import require_owner
from app.schemas.vehicle import AdminStatsResponse, RecentActivityResponse
from app.services import vehicle_service

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard stats
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/stats",
    response_model=AdminStatsResponse,
    summary="Admin dashboard summary stats",
)
async def get_admin_stats(current_owner=Depends(require_owner)):
    """
    Returns counts and lists for the dashboard widgets in AdminDashboard.jsx:
    - Total Vehicles, Active Drivers, Trips Today, Pending Documents count
    - Available, Booked, Maintenance vehicle counts
    - Vehicle type distribution
    - Document expiry alerts list (Insurance, Permit, Fitness, PUC)
    - Payments summary (Pending, Overdue)
    - Upcoming driver duties list
    """
    db = get_database()

    # Get enriched stats from service
    stats = await vehicle_service.get_enriched_dashboard_stats(current_owner.id, db)

    # Active drivers — users with role=driver, is_active=True, owner_id=current_owner
    active_drivers = await db.users.count_documents({
        "role": UserRole.DRIVER,
        "is_active": True,
        "owner_id": current_owner.id,
    })

    return AdminStatsResponse(
        total_vehicles=stats["total_vehicles"],
        active_drivers=active_drivers,
        trips_today=stats["trips_today"],
        pending_documents=stats["pending_documents_count"],
        available_vehicles=stats["available_vehicles"],
        booked_vehicles=stats["booked_vehicles"],
        maintenance_vehicles=stats["maintenance_vehicles"],
        type_distribution=stats["type_distribution"],
        document_expiry_alerts=stats["document_expiry_alerts"],
        payments=stats["payments"],
        upcoming_duties=stats["upcoming_duties"],
        total_profit=stats["total_profit"]
    )


# ──────────────────────────────────────────────────────────────────────────────
# Recent activity
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/recent-activity",
    response_model=RecentActivityResponse,
    summary="Recent vehicle activity for admin dashboard table",
)
async def get_recent_activity(current_owner=Depends(require_owner)):
    """
    Returns the 10 most recently updated vehicles as activity rows.
    Used by the 'Recent Vehicle Activity' table in AdminDashboard.jsx.
    """
    db = get_database()
    rows = await vehicle_service.get_recent_activity(current_owner.id, db, limit=10)
    return RecentActivityResponse(activities=rows)
