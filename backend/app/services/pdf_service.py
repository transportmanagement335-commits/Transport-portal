"""
PDF service — generates professional invoice PDFs using ReportLab.
Saves to backend/uploads/invoices/{owner_id}/{invoice_number}.pdf
Returns the relative URL path (e.g., /uploads/invoices/xxx/INV-2026-0001.pdf).
"""
import os
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    HRFlowable,
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER


# Brand colour
BRAND_BLUE  = colors.HexColor("#2563eb")
BRAND_LIGHT = colors.HexColor("#eff6ff")
GRAY_50     = colors.HexColor("#f8fafc")
GRAY_200    = colors.HexColor("#e2e8f0")
GRAY_500    = colors.HexColor("#64748b")
GREEN       = colors.HexColor("#16a34a")
RED         = colors.HexColor("#dc2626")
YELLOW      = colors.HexColor("#d97706")

STATUS_COLORS = {
    "draft":     (colors.HexColor("#6b7280"), colors.HexColor("#f3f4f6")),
    "sent":      (colors.HexColor("#1d4ed8"), colors.HexColor("#dbeafe")),
    "viewed":    (colors.HexColor("#7c3aed"), colors.HexColor("#ede9fe")),
    "paid":      (colors.HexColor("#15803d"), colors.HexColor("#dcfce7")),
    "partial":   (colors.HexColor("#b45309"), colors.HexColor("#fef3c7")),
    "overdue":   (colors.HexColor("#b91c1c"), colors.HexColor("#fee2e2")),
    "cancelled": (colors.HexColor("#374151"), colors.HexColor("#f3f4f6")),
}


def _fmt_money(amount: float, currency: str = "INR") -> str:
    symbol = "₹" if currency == "INR" else currency
    return f"{symbol}{amount:,.2f}"


def _fmt_date(dt) -> str:
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return str(dt)
    if isinstance(dt, datetime):
        return dt.strftime("%d %b %Y")
    return str(dt)


def generate_invoice_pdf(invoice: dict) -> str:
    """
    Generate a professional A4 PDF invoice.
    Returns the file path where the PDF was saved.
    """
    owner_id = invoice.get("issuer_id", "unknown")
    invoice_number = invoice.get("invoice_number", "INV-XXXX")
    currency = invoice.get("currency", "INR")

    # Create directory
    save_dir = os.path.join("uploads", "invoices", owner_id)
    os.makedirs(save_dir, exist_ok=True)
    file_path = os.path.join(save_dir, f"{invoice_number}.pdf")

    doc = SimpleDocTemplate(
        file_path,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )

    styles = getSampleStyleSheet()
    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    # Two-column: Company info left | Invoice meta right
    issuer = invoice.get("issuer_details") or {}
    status = invoice.get("status", "draft")
    status_fg, status_bg = STATUS_COLORS.get(status, (GRAY_500, GRAY_50))

    header_data = [
        [
            Paragraph(
                f'<font size="18" color="#2563eb"><b>INVOICE</b></font>',
                styles["Normal"],
            ),
            Paragraph(
                f'<font size="9" color="#64748b">Invoice No.</font><br/>'
                f'<font size="13" color="#0f172a"><b>{invoice_number}</b></font>',
                styles["Normal"],
            ),
        ],
        [
            Paragraph(
                f'<font size="11" color="#0f172a"><b>{issuer.get("name", "Transport Company")}</b></font><br/>'
                f'<font size="8" color="#64748b">'
                f'{issuer.get("address", "") or ""}<br/>'
                f'GST: {issuer.get("gst", "N/A")}<br/>'
                f'Ph: {issuer.get("phone", "")}</font>',
                styles["Normal"],
            ),
            Paragraph(
                f'<font size="8" color="#64748b">Issue Date: {_fmt_date(invoice.get("issue_date"))}<br/>'
                f'Due Date: {_fmt_date(invoice.get("due_date"))}<br/>'
                f'Status: <b>{status.upper()}</b><br/>'
                f'Currency: {currency}</font>',
                styles["Normal"],
            ),
        ],
    ]

    header_table = Table(header_data, colWidths=[95 * mm, 80 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=BRAND_BLUE, spaceAfter=8))

    # ── Bill From / Bill To ────────────────────────────────────────────────────
    recipient = invoice.get("recipient_details") or {}
    party_style = ParagraphStyle("party", fontSize=8, leading=12, textColor=colors.HexColor("#374151"))
    label_style = ParagraphStyle("label", fontSize=7, leading=10, textColor=GRAY_500)

    party_data = [
        [
            Paragraph("BILL FROM", label_style),
            Paragraph("BILL TO", label_style),
        ],
        [
            Paragraph(
                f'<b>{issuer.get("name", "")}</b><br/>'
                f'{issuer.get("address", "") or ""}<br/>'
                f'GST: {issuer.get("gst", "N/A")}<br/>'
                f'Ph: {issuer.get("phone", "")}',
                party_style,
            ),
            Paragraph(
                f'<b>{recipient.get("name", "")}</b><br/>'
                f'{recipient.get("address", "") or ""}<br/>'
                f'GST: {recipient.get("gst", "N/A")}<br/>'
                f'Ph: {recipient.get("phone", "")}',
                party_style,
            ),
        ],
    ]

    party_table = Table(party_data, colWidths=[87.5 * mm, 87.5 * mm])
    party_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
        ("TEXTCOLOR", (0, 0), (-1, 0), BRAND_BLUE),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, GRAY_200),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, GRAY_200),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white]),
    ]))
    story.append(Spacer(1, 8))
    story.append(party_table)
    story.append(Spacer(1, 12))

    # ── Line Items Table ───────────────────────────────────────────────────────
    items = invoice.get("items", [])
    item_header = ["#", "Description", "Unit", "Qty", "Rate", "Amount"]
    item_rows = [item_header]
    for i, item in enumerate(items, 1):
        if isinstance(item, dict):
            desc = item.get("description", "")
            unit = item.get("unit", "fixed")
            qty  = item.get("quantity", 1)
            rate = item.get("rate", 0)
            amt  = item.get("amount", 0)
        else:
            continue
        item_rows.append([
            str(i),
            desc,
            unit,
            str(qty),
            _fmt_money(rate, currency),
            _fmt_money(amt, currency),
        ])

    item_table = Table(
        item_rows,
        colWidths=[8 * mm, 70 * mm, 18 * mm, 15 * mm, 28 * mm, 28 * mm],
    )
    item_table.setStyle(TableStyle([
        # Header row
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        # Data rows
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_50]),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        # Borders
        ("GRID", (0, 0), (-1, -1), 0.5, GRAY_200),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 10))

    # ── Totals Box ────────────────────────────────────────────────────────────
    subtotal    = invoice.get("subtotal", 0)
    tax_rate    = invoice.get("tax_rate", 0)
    tax_amount  = invoice.get("tax_amount", 0)
    discount    = invoice.get("discount", 0)
    total       = invoice.get("total_amount", 0)
    paid        = invoice.get("paid_amount", 0)
    balance     = round(total - paid, 2)

    totals_style = ParagraphStyle("totals", fontSize=8, leading=12)
    totals_data = [
        ["Subtotal:", _fmt_money(subtotal, currency)],
        [f"Tax ({tax_rate}%):", _fmt_money(tax_amount, currency)],
        [f"Discount:", f"- {_fmt_money(discount, currency)}"],
        ["TOTAL:", _fmt_money(total, currency)],
        ["Paid:", _fmt_money(paid, currency)],
        ["Balance Due:", _fmt_money(balance, currency)],
    ]

    totals_table = Table(totals_data, colWidths=[40 * mm, 35 * mm])
    totals_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 3), (1, 3), "Helvetica-Bold"),
        ("FONTSIZE", (0, 3), (1, 3), 10),
        ("TEXTCOLOR", (0, 3), (1, 3), BRAND_BLUE),
        ("FONTNAME", (0, 5), (1, 5), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 5), (1, 5), RED if balance > 0 else GREEN),
        ("LINEABOVE", (0, 3), (1, 3), 1, BRAND_BLUE),
        ("LINEBELOW", (0, 5), (1, 5), 1, GRAY_200),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))

    # Right-align totals table
    totals_wrapper = Table([[None, totals_table]], colWidths=[107.5 * mm, 75 * mm])
    totals_wrapper.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(totals_wrapper)
    story.append(Spacer(1, 16))

    # ── Notes & Terms ─────────────────────────────────────────────────────────
    if invoice.get("notes"):
        story.append(Paragraph(
            f'<font size="8" color="#374151"><b>Notes:</b> {invoice["notes"]}</font>',
            styles["Normal"],
        ))
        story.append(Spacer(1, 6))

    story.append(Paragraph(
        f'<font size="8" color="#64748b"><b>Terms:</b> {invoice.get("terms", "Payment due within 30 days")}</font>',
        styles["Normal"],
    ))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_200, spaceAfter=8))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Paragraph(
        '<font size="8" color="#64748b">Thank you for your business! '
        'For queries, please contact us. This is a computer-generated invoice.</font>',
        ParagraphStyle("footer", fontSize=8, alignment=TA_CENTER),
    ))

    doc.build(story)
    return file_path


# ──────────────────────────────────────────────────────────────────────────────
# Business Report PDF
# ──────────────────────────────────────────────────────────────────────────────

def generate_business_report_pdf(
    report_data: dict,
    owner_name: str,
    range_filter: str,
) -> str:
    """
    Generate an executive-quality A4 PDF business report.
    Returns the file path where the PDF was saved.
    """
    save_dir = os.path.join("uploads", "reports")
    os.makedirs(save_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_range = range_filter.replace(" ", "_")
    file_path = os.path.join(save_dir, f"Business_Report_{safe_range}_{timestamp}.pdf")

    doc = SimpleDocTemplate(
        file_path,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )

    styles = getSampleStyleSheet()
    story = []

    kpi = report_data.get("kpi", {})
    trend = report_data.get("trend", [])
    insights = report_data.get("aiInsights", [])
    top_clients = report_data.get("topClients", [])
    top_vehicles = report_data.get("topVehicles", [])
    top_drivers = report_data.get("topDrivers", [])

    # ── Header ────────────────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph(
                f'<font size="18" color="#2563eb"><b>BUSINESS REPORT</b></font>',
                styles["Normal"],
            ),
            Paragraph(
                f'<font size="9" color="#64748b">Period</font><br/>'
                f'<font size="12" color="#0f172a"><b>{range_filter}</b></font>',
                styles["Normal"],
            ),
        ],
        [
            Paragraph(
                f'<font size="11" color="#0f172a"><b>{owner_name}</b></font><br/>'
                f'<font size="8" color="#64748b">Generated: {datetime.now().strftime("%d %b %Y, %I:%M %p")}</font>',
                styles["Normal"],
            ),
            Paragraph(
                f'<font size="8" color="#64748b">Comprehensive overview of<br/>'
                f'business performance and insights</font>',
                styles["Normal"],
            ),
        ],
    ]
    header_table = Table(header_data, colWidths=[95 * mm, 80 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=BRAND_BLUE, spaceAfter=12))

    # ── KPI Summary ───────────────────────────────────────────────────────────
    story.append(Paragraph(
        '<font size="12" color="#2563eb"><b>Key Performance Indicators</b></font>',
        styles["Normal"],
    ))
    story.append(Spacer(1, 6))

    def _kpi_trend_text(val):
        if val is None:
            return '<font color="#64748b">—</font>'
        if val >= 0:
            return f'<font color="#16a34a">▲ {val}%</font>'
        return f'<font color="#dc2626">▼ {abs(val)}%</font>'

    kpi_data = [
        [
            Paragraph('<font size="7" color="#64748b"><b>METRIC</b></font>', styles["Normal"]),
            Paragraph('<font size="7" color="#64748b"><b>VALUE</b></font>', styles["Normal"]),
            Paragraph('<font size="7" color="#64748b"><b>VS PREV PERIOD</b></font>', styles["Normal"]),
        ],
        [
            Paragraph('<font size="9">Total Revenue</font>', styles["Normal"]),
            Paragraph(f'<font size="9"><b>{_fmt_money(kpi.get("totalRevenue", 0))}</b></font>', styles["Normal"]),
            Paragraph(f'<font size="8">{_kpi_trend_text(kpi.get("revenueTrend"))}</font>', styles["Normal"]),
        ],
        [
            Paragraph('<font size="9">Total Expense</font>', styles["Normal"]),
            Paragraph(f'<font size="9"><b>{_fmt_money(kpi.get("totalExpense", 0))}</b></font>', styles["Normal"]),
            Paragraph(f'<font size="8">{_kpi_trend_text(kpi.get("expenseTrend"))}</font>', styles["Normal"]),
        ],
        [
            Paragraph('<font size="9">Total Profit</font>', styles["Normal"]),
            Paragraph(f'<font size="9"><b>{_fmt_money(kpi.get("totalProfit", 0))}</b></font>', styles["Normal"]),
            Paragraph(f'<font size="8">{_kpi_trend_text(kpi.get("profitTrend"))}</font>', styles["Normal"]),
        ],
        [
            Paragraph('<font size="9">Trips Completed</font>', styles["Normal"]),
            Paragraph(f'<font size="9"><b>{kpi.get("tripsCompleted", 0)}</b></font>', styles["Normal"]),
            Paragraph(f'<font size="8">{_kpi_trend_text(kpi.get("tripsTrend"))}</font>', styles["Normal"]),
        ],
        [
            Paragraph('<font size="9">Profit Margin</font>', styles["Normal"]),
            Paragraph(f'<font size="9"><b>{kpi.get("profitMargin", 0)}%</b></font>', styles["Normal"]),
            Paragraph(f'<font size="8">{_kpi_trend_text(kpi.get("marginTrend"))}</font>', styles["Normal"]),
        ],
    ]

    kpi_table = Table(kpi_data, colWidths=[60 * mm, 55 * mm, 55 * mm])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_50]),
        ("GRID", (0, 0), (-1, -1), 0.5, GRAY_200),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 14))

    # ── Monthly Trend Table ───────────────────────────────────────────────────
    if trend:
        story.append(Paragraph(
            '<font size="12" color="#2563eb"><b>Monthly Revenue, Expense &amp; Profit</b></font>',
            styles["Normal"],
        ))
        story.append(Spacer(1, 6))

        trend_header = ["Month", "Revenue (₹)", "Expense (₹)", "Profit (₹)"]
        trend_rows = [trend_header]
        for t in trend:
            trend_rows.append([
                t.get("month", ""),
                _fmt_money(t.get("revenue", 0)),
                _fmt_money(t.get("expense", 0)),
                _fmt_money(t.get("profit", 0)),
            ])

        trend_table = Table(trend_rows, colWidths=[35 * mm, 45 * mm, 45 * mm, 45 * mm])
        trend_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_50]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_200),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(trend_table)
        story.append(Spacer(1, 14))

    # ── Top Clients ───────────────────────────────────────────────────────────
    if top_clients:
        story.append(Paragraph(
            '<font size="12" color="#2563eb"><b>Top Performing Clients</b></font>',
            styles["Normal"],
        ))
        story.append(Spacer(1, 6))

        client_rows = [["Client Name", "Trips", "Revenue (₹)", "Profit (₹)", "Growth"]]
        for c in top_clients:
            growth = c.get("growth", 0)
            growth_str = f"▲ {growth}%" if growth >= 0 else f"▼ {abs(growth)}%"
            client_rows.append([
                c.get("name", ""),
                str(c.get("trips", 0)),
                _fmt_money(c.get("revenue", 0)),
                _fmt_money(c.get("profit", 0)),
                growth_str,
            ])

        client_table = Table(client_rows, colWidths=[45 * mm, 20 * mm, 35 * mm, 35 * mm, 30 * mm])
        client_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_50]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_200),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(client_table)
        story.append(Spacer(1, 14))

    # ── Top Vehicles ──────────────────────────────────────────────────────────
    if top_vehicles:
        story.append(Paragraph(
            '<font size="12" color="#2563eb"><b>Top Performing Vehicles</b></font>',
            styles["Normal"],
        ))
        story.append(Spacer(1, 6))

        vehicle_rows = [["Vehicle No.", "Trips", "Revenue (₹)", "Profit (₹)", "Utilization"]]
        for v in top_vehicles:
            vehicle_rows.append([
                v.get("vehicleNo", ""),
                str(v.get("trips", 0)),
                _fmt_money(v.get("revenue", 0)),
                _fmt_money(v.get("profit", 0)),
                f'{v.get("utilization", 0)}%',
            ])

        vehicle_table = Table(vehicle_rows, colWidths=[45 * mm, 20 * mm, 35 * mm, 35 * mm, 30 * mm])
        vehicle_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_50]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_200),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(vehicle_table)
        story.append(Spacer(1, 14))

    # ── Top Drivers ───────────────────────────────────────────────────────────
    if top_drivers:
        story.append(Paragraph(
            '<font size="12" color="#2563eb"><b>Top Performing Drivers</b></font>',
            styles["Normal"],
        ))
        story.append(Spacer(1, 6))

        driver_rows = [["Driver Name", "Trips", "KM Driven", "Revenue (₹)", "Rating"]]
        for d in top_drivers:
            km = d.get("kmDriven", 0)
            km_str = f'{km:,.0f}' if km else "—"
            rating = d.get("rating")
            rating_str = f'★ {rating}' if rating is not None else "—"
            driver_rows.append([
                d.get("name", ""),
                str(d.get("trips", 0)),
                km_str,
                _fmt_money(d.get("revenue", 0)),
                rating_str,
            ])

        driver_table = Table(driver_rows, colWidths=[45 * mm, 20 * mm, 30 * mm, 35 * mm, 30 * mm])
        driver_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_50]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_200),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(driver_table)
        story.append(Spacer(1, 14))

    # ── AI Insights ───────────────────────────────────────────────────────────
    if insights:
        story.append(Paragraph(
            '<font size="12" color="#2563eb"><b>AI Business Insights</b></font>',
            styles["Normal"],
        ))
        story.append(Spacer(1, 6))

        insight_style = ParagraphStyle(
            "insight", fontSize=8, leading=12, textColor=colors.HexColor("#374151"),
        )
        for item in insights:
            # Strip HTML bold tags for PDF (ReportLab supports them natively)
            text = item.get("text", "")
            story.append(Paragraph(f'• {text}', insight_style))
            story.append(Spacer(1, 3))

        story.append(Spacer(1, 10))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_200, spaceAfter=8))
    story.append(Paragraph(
        f'<font size="8" color="#64748b">Report generated by {owner_name} Transport Portal — '
        f'{datetime.now().strftime("%d %b %Y, %I:%M %p")}. '
        f'This is an auto-generated business intelligence report.</font>',
        ParagraphStyle("footer", fontSize=8, alignment=TA_CENTER),
    ))

    doc.build(story)
    return file_path
