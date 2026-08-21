"""
Reports routes — business report API and PDF download.

Route summary:
  GET /api/reports/business?range=...      → Full JSON business report
  GET /api/reports/business/pdf?range=...  → Download executive PDF report
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from app.database import get_database
from app.routes.auth import require_owner
from app.services import report_service
from app.services.pdf_service import generate_business_report_pdf

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# Business report JSON
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/business",
    summary="Get full business report data",
)
async def get_business_report(
    range: str = Query("This Month", alias="range"),
    current_owner=Depends(require_owner),
):
    """
    Returns KPI cards, monthly trend chart data, AI insights,
    and top-performing clients / vehicles / drivers.

    Supported range values:
      - "This Month"
      - "Last Month"
      - "Last 3 Months"
      - "This Year"
    """
    db = get_database()
    report = await report_service.get_business_report(
        owner_id=current_owner.id,
        range_filter=range,
        db=db,
    )
    return report


# ──────────────────────────────────────────────────────────────────────────────
# Business report PDF download
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/business/pdf",
    summary="Download business report as PDF",
)
async def download_business_report_pdf(
    range: str = Query("This Month", alias="range"),
    current_owner=Depends(require_owner),
):
    """
    Generates an executive PDF summary of the business report
    and returns it as a downloadable file.
    """
    db = get_database()
    report = await report_service.get_business_report(
        owner_id=current_owner.id,
        range_filter=range,
        db=db,
    )

    owner_name = current_owner.company_name or current_owner.name or "Transport Company"

    file_path = generate_business_report_pdf(
        report_data=report,
        owner_name=owner_name,
        range_filter=range,
    )

    safe_name = range.replace(" ", "_")
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"Business_Report_{safe_name}.pdf",
        headers={"Content-Disposition": f'attachment; filename="Business_Report_{safe_name}.pdf"'},
    )
