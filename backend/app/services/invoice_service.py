"""
backend/app/services/invoice_generator.py
------------------------------------------
Generates a TMS-styled HTML invoice from payment/trip data.
Drop this file into your services/ folder and call it from payment_service.py.

Usage in payment_service.py:
    from app.services.invoice_generator import generate_invoice_html, InvoiceData, TripRow

    def get_invoice(self, client_id: int) -> str:
        # ... fetch data from DB ...
        data = InvoiceData(...)
        return generate_invoice_html(data)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List
from datetime import date


# ── DATA CLASSES ─────────────────────────────────────────────────────────────

@dataclass
class TripRow:
    trip_id: str          # e.g. "SRL-0127"
    date: str             # e.g. "19-Mar-21"
    truck_no: str         # e.g. "AP09CD4488"
    from_place: str       # e.g. "Tirupati"
    to_place: str         # e.g. "Nellore"
    weight: str           # e.g. "38 Tonnes"
    freight: float
    advance: float
    charges: float

    @property
    def balance_due(self) -> float:
        return self.freight + self.charges - self.advance


@dataclass
class InvoiceData:
    # Invoice meta
    invoice_no: str
    invoice_date: str
    due_date: str
    status: str           # "due" | "paid" | "partial"

    # Parties
    company_name: str
    company_address: str
    company_phone: str
    company_gstin: str
    company_pan: str

    client_name: str
    client_phone: str
    client_id: str
    client_address: str

    # Bank
    bank_acc_name: str
    bank_acc_no: str
    bank_ifsc: str
    bank_name: str
    bank_upi: str

    # Trips
    trips: List[TripRow] = field(default_factory=list)

    # Tax
    cgst_rate: float = 6.0
    sgst_rate: float = 6.0
    amount_received: float = 0.0

    # Computed
    @property
    def total_freight(self) -> float:
        return sum(t.freight for t in self.trips)

    @property
    def total_charges(self) -> float:
        return sum(t.charges for t in self.trips)

    @property
    def total_advance(self) -> float:
        return sum(t.advance for t in self.trips)

    @property
    def taxable(self) -> float:
        return round(self.total_freight + self.total_charges, 2)

    @property
    def cgst(self) -> float:
        return round(self.taxable * self.cgst_rate / 100, 2)

    @property
    def sgst(self) -> float:
        return round(self.taxable * self.sgst_rate / 100, 2)

    @property
    def total_invoice_value(self) -> float:
        return round(self.taxable + self.cgst + self.sgst, 2)

    @property
    def balance_due(self) -> float:
        return round(self.total_invoice_value - self.amount_received, 2)


# ── HELPERS ──────────────────────────────────────────────────────────────────

def _r(amount: float) -> str:
    """Format float as Indian Rupee string."""
    val = int(round(abs(amount)))
    s = ""
    if val == 0:
        return "₹0"
    # Indian grouping
    last3 = val % 1000
    val //= 1000
    if val == 0:
        s = str(last3)
    else:
        s = f"{last3:03d}"
        while val > 0:
            s = f"{val % 100:02d},{s}" if val >= 100 else f"{val},{s}"
            val //= 100
    prefix = "-₹" if amount < 0 else "₹"
    return f"{prefix}{s}"


def _status_badge(status: str) -> str:
    classes = {"due": "due", "paid": "paid", "partial": "partial"}
    labels  = {"due": "● Due", "paid": "● Paid", "partial": "● Partial"}
    cls = classes.get(status, "due")
    lbl = labels.get(status, "● Due")
    return f'<span class="badge {cls}">{lbl}</span>'


def _trip_rows_html(trips: List[TripRow]) -> str:
    rows = []
    for i, t in enumerate(trips, 1):
        due_color = "color:#e53e3e;" if t.balance_due > 0 else "color:#16a34a;"
        rows.append(f"""
        <tr>
          <td>{i}</td>
          <td><div class="trip-id">{t.trip_id}</div></td>
          <td>{t.date}</td>
          <td>{t.truck_no}</td>
          <td>{t.from_place} → {t.to_place}<div class="trip-route">{t.weight}</div></td>
          <td>{_r(t.freight)}</td>
          <td>{_r(t.advance)}</td>
          <td>{_r(t.charges)}</td>
          <td style="{due_color}">{_r(t.balance_due)}</td>
        </tr>""")
    return "\n".join(rows)


# ── HTML GENERATOR ────────────────────────────────────────────────────────────

def generate_invoice_html(d: InvoiceData) -> str:

    CSS = """
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :root {
        --navy:#1a2035; --navy-light:#2e3d63;
        --accent:#e53e3e; --blue:#3b82f6; --blue-light:#eff6ff;
        --orange:#f97316; --orange-light:#fff7ed;
        --green:#22c55e; --green-light:#f0fdf4;
        --red-light:#fef2f2; --text:#111827; --text-mid:#4b5563;
        --text-light:#9ca3af; --border:#e5e7eb; --bg:#f3f4f6;
      }
      body { font-family:'Inter',sans-serif; background:var(--bg); color:var(--text); padding:32px 16px; font-size:13px; }
      .top-bar { max-width:860px; margin:0 auto 20px; display:flex; align-items:center; justify-content:space-between; }
      .top-bar-brand { font-size:18px; font-weight:800; color:var(--navy); }
      .top-bar-breadcrumb { font-size:12px; color:var(--text-mid); }
      .top-bar-breadcrumb span { color:var(--navy); font-weight:600; }
      .print-btn { display:flex; align-items:center; gap:6px; background:var(--navy); color:#fff; border:none; border-radius:8px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; font-family:'Inter',sans-serif; }
      .card { max-width:860px; margin:0 auto; background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(0,0,0,.08); overflow:hidden; }
      .inv-header { background:var(--navy); padding:28px 32px; display:flex; align-items:center; justify-content:space-between; }
      .inv-brand { display:flex; align-items:center; gap:14px; }
      .inv-logo { width:48px; height:48px; background:rgba(255,255,255,.12); border-radius:12px; display:flex; align-items:center; justify-content:center; }
      .inv-logo svg { width:28px; height:28px; }
      .inv-brand-text h1 { font-size:18px; font-weight:800; color:#fff; }
      .inv-brand-text p { font-size:11px; color:rgba(255,255,255,.55); margin-top:2px; }
      .inv-title-block { text-align:right; }
      .inv-title-block h2 { font-size:26px; font-weight:800; color:#fff; letter-spacing:2px; text-transform:uppercase; }
      .inv-title-block p { font-size:11.5px; color:rgba(255,255,255,.6); margin-top:4px; line-height:1.7; }
      .inv-title-block p span { color:rgba(255,255,255,.9); font-weight:600; }
      .badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; }
      .badge.due    { background:var(--red-light);    color:var(--accent); }
      .badge.paid   { background:var(--green-light);  color:#16a34a; }
      .badge.partial{ background:var(--orange-light); color:var(--orange); }
      .inv-body { padding:28px 32px; }
      .bill-row { display:flex; gap:20px; margin-bottom:24px; }
      .bill-box { flex:1; background:var(--bg); border-radius:10px; padding:14px 18px; border:1px solid var(--border); }
      .bill-box h4 { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--text-light); font-weight:700; margin-bottom:8px; }
      .bill-box .name { font-size:15px; font-weight:700; color:var(--text); }
      .bill-box p { font-size:12px; color:var(--text-mid); line-height:1.7; margin-top:4px; }
      .stats-row { display:flex; gap:14px; margin-bottom:24px; }
      .stat-card { flex:1; border-radius:12px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; }
      .stat-card.orange { background:var(--orange-light); }
      .stat-card.red    { background:var(--red-light); }
      .stat-card.green  { background:var(--green-light); }
      .stat-card.blue   { background:var(--blue-light); }
      .stat-card-label { font-size:11px; font-weight:600; color:var(--text-mid); }
      .stat-card-value { font-size:20px; font-weight:800; color:var(--text); margin-top:3px; }
      .stat-card.orange .stat-card-value { color:var(--orange); }
      .stat-card.red    .stat-card-value { color:var(--accent); }
      .stat-card.green  .stat-card-value { color:#16a34a; }
      .stat-card.blue   .stat-card-value { color:var(--blue); }
      .stat-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; }
      .stat-card.orange .stat-icon { background:rgba(249,115,22,.15); }
      .stat-card.red    .stat-icon { background:rgba(229,62,62,.12); }
      .stat-card.green  .stat-icon { background:rgba(34,197,94,.15); }
      .stat-card.blue   .stat-icon { background:rgba(59,130,246,.12); }
      .section-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--text-light); margin-bottom:10px; }
      .trips-table { width:100%; border-collapse:collapse; margin-bottom:24px; font-size:12.5px; }
      .trips-table thead tr { background:var(--navy); color:#fff; }
      .trips-table thead th { padding:10px 14px; text-align:left; font-size:11px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; }
      .trips-table thead th:last-child { text-align:right; }
      .trips-table tbody tr { border-bottom:1px solid var(--border); }
      .trips-table tbody td { padding:12px 14px; color:var(--text); }
      .trips-table tbody td:last-child { text-align:right; font-weight:600; }
      .trip-id { font-weight:700; color:var(--navy); }
      .trip-route { font-size:11.5px; color:var(--text-mid); margin-top:2px; }
      .bottom-row { display:flex; gap:20px; align-items:flex-start; }
      .bank-box { flex:1.2; background:var(--bg); border-radius:10px; border:1px solid var(--border); padding:16px 18px; }
      .bank-box h4 { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--text-light); font-weight:700; margin-bottom:10px; }
      .bank-row { display:flex; justify-content:space-between; font-size:12px; padding:4px 0; border-bottom:1px solid var(--border); }
      .bank-row:last-child { border-bottom:none; }
      .bank-row span:first-child { color:var(--text-mid); }
      .bank-row span:last-child { font-weight:600; color:var(--text); }
      .tax-box { flex:1; }
      .tax-row { display:flex; justify-content:space-between; padding:8px 14px; border-radius:8px; font-size:13px; margin-bottom:4px; }
      .tax-row.sub { background:var(--bg); color:var(--text-mid); }
      .tax-row.sub span:last-child { font-weight:600; color:var(--text); }
      .tax-row.total { background:var(--navy); color:#fff; font-size:15px; font-weight:700; margin-top:6px; border-radius:10px; }
      .tax-row.received { background:var(--green-light); color:#16a34a; font-weight:600; }
      .tax-row.balance  { background:var(--red-light); color:var(--accent); font-weight:700; }
      .inv-footer { background:var(--navy); padding:18px 32px; display:flex; align-items:center; justify-content:space-between; }
      .inv-footer p { font-size:11px; color:rgba(255,255,255,.45); }
      .inv-footer .sig { text-align:right; }
      .inv-footer .sig p { color:rgba(255,255,255,.55); font-size:11px; }
      .inv-footer .sig strong { display:block; color:#fff; font-size:13px; margin-top:3px; border-top:1px solid rgba(255,255,255,.2); padding-top:6px; }
      @media print { body{background:none;padding:0;} .top-bar{display:none;} .card{box-shadow:none;border-radius:0;max-width:100%;} .print-btn{display:none;} }
    </style>
    """

    LOGO = """<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="20" width="36" height="22" rx="3" fill="#fff" opacity=".85"/>
      <path d="M40 28h8l6 8v6H40V28z" fill="#fff" opacity=".7"/>
      <circle cx="14" cy="44" r="5" fill="#fff"/>
      <circle cx="50" cy="44" r="5" fill="#fff"/>
      <rect x="8" y="24" width="28" height="14" rx="2" fill="#1a2035" opacity=".4"/>
    </svg>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice {d.invoice_no} – TMS Admin</title>
  {CSS}
</head>
<body>

<div class="top-bar">
  <div>
    <div class="top-bar-brand">TMS Admin</div>
    <div class="top-bar-breadcrumb">Dashboard › Payments › <span>Invoice {d.invoice_no}</span></div>
  </div>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
</div>

<div class="card">

  <div class="inv-header">
    <div class="inv-brand">
      <div class="inv-logo">{LOGO}</div>
      <div class="inv-brand-text">
        <h1>{d.company_name}</h1>
        <p>{d.company_address}<br>GSTIN: {d.company_gstin} &nbsp;|&nbsp; PAN: {d.company_pan}</p>
      </div>
    </div>
    <div class="inv-title-block">
      <h2>Invoice</h2>
      <p>Invoice No: <span>{d.invoice_no}</span><br>
         Date: <span>{d.invoice_date}</span><br>
         Due Date: <span>{d.due_date}</span></p>
      <div style="margin-top:8px;">{_status_badge(d.status)}</div>
    </div>
  </div>

  <div class="inv-body">

    <div class="bill-row">
      <div class="bill-box">
        <h4>Bill From</h4>
        <div class="name">{d.company_name}</div>
        <p>{d.company_address}<br>{d.company_phone}</p>
      </div>
      <div class="bill-box">
        <h4>Bill To</h4>
        <div class="name">{d.client_name}</div>
        <p>{d.client_phone}<br>Client ID: {d.client_id}<br>{d.client_address}</p>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card orange">
        <div>
          <div class="stat-card-label">Total Freight</div>
          <div class="stat-card-value">{_r(d.total_freight)}</div>
        </div>
        <div class="stat-icon">💰</div>
      </div>
      <div class="stat-card red">
        <div>
          <div class="stat-card-label">Balance Due</div>
          <div class="stat-card-value">{_r(d.balance_due)}</div>
        </div>
        <div class="stat-icon">⚠️</div>
      </div>
      <div class="stat-card green">
        <div>
          <div class="stat-card-label">Amount Received</div>
          <div class="stat-card-value">{_r(d.amount_received)}</div>
        </div>
        <div class="stat-icon">✅</div>
      </div>
      <div class="stat-card blue">
        <div>
          <div class="stat-card-label">Total Trips</div>
          <div class="stat-card-value">{len(d.trips)}</div>
        </div>
        <div class="stat-icon">🚛</div>
      </div>
    </div>

    <div class="section-label">Trip Details</div>
    <table class="trips-table">
      <thead>
        <tr>
          <th>#</th><th>Trip ID</th><th>Date</th><th>Truck No</th>
          <th>Route</th><th>Freight</th><th>Advance</th><th>Charges</th><th>Balance Due</th>
        </tr>
      </thead>
      <tbody>
        {_trip_rows_html(d.trips)}
      </tbody>
    </table>

    <div class="bottom-row">
      <div class="bank-box">
        <h4>Bank Details</h4>
        <div class="bank-row"><span>Account Name</span><span>{d.bank_acc_name}</span></div>
        <div class="bank-row"><span>Account No</span><span>{d.bank_acc_no}</span></div>
        <div class="bank-row"><span>IFSC</span><span>{d.bank_ifsc}</span></div>
        <div class="bank-row"><span>Bank</span><span>{d.bank_name}</span></div>
        <div class="bank-row"><span>UPI ID</span><span>{d.bank_upi}</span></div>
      </div>
      <div class="tax-box">
        <div class="tax-row sub"><span>Freight Amount</span><span>{_r(d.total_freight)}</span></div>
        <div class="tax-row sub"><span>Extra Charges</span><span>{_r(d.total_charges)}</span></div>
        <div class="tax-row sub"><span>CGST @ {d.cgst_rate:.0f}%</span><span>{_r(d.cgst)}</span></div>
        <div class="tax-row sub"><span>SGST @ {d.sgst_rate:.0f}%</span><span>{_r(d.sgst)}</span></div>
        <div class="tax-row total"><span>Total Invoice Value</span><span>{_r(d.total_invoice_value)}</span></div>
        <div class="tax-row received"><span>Amount Received</span><span>{_r(d.amount_received)}</span></div>
        <div class="tax-row balance"><span>Balance Due</span><span>{_r(d.balance_due)}</span></div>
      </div>
    </div>

  </div>

  <div class="inv-footer">
    <div>
      <p>Generated by TMS Admin · Transport Management System</p>
      <p style="margin-top:3px;">This is a system-generated invoice.</p>
    </div>
    <div class="sig">
      <p>For {d.company_name}</p>
      <strong>Authorized Signatory</strong>
    </div>
  </div>

</div>
</body>
</html>"""


# ── EXAMPLE / TEST ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os

    data = InvoiceData(
        invoice_no="#TMS-0021",
        invoice_date="26-04-2021",
        due_date="25-05-2021",
        status="due",

        company_name="Sriram Logistics",
        company_address="123 4th Cross 6th Main, Tirupati, Andhra Pradesh – 524002",
        company_phone="+91 99000 92660",
        company_gstin="36AAAC07727M1Z8",
        company_pan="AAAC07727M",

        client_name="XYz",
        client_phone="8850395128",
        client_id="CLT-00041",
        client_address="Nellore, Andhra Pradesh",

        bank_acc_name="Sriram",
        bank_acc_no="09162222000414994",
        bank_ifsc="HDFC0BS93140",
        bank_name="HDFC Bank (IT NAGAR)",
        bank_upi="Sriram@upi",

        trips=[
            TripRow(
                trip_id="SRL-0127",
                date="19-Mar-21",
                truck_no="AP09CD4488",
                from_place="Tirupati",
                to_place="Nellore",
                weight="38 Tonnes",
                freight=12000,
                advance=2000,
                charges=0,
            )
        ],
        cgst_rate=6.0,
        sgst_rate=6.0,
        amount_received=2000,
    )

    html = generate_invoice_html(data)
    out = "invoice_TMS-0021.html"
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅  Invoice saved → {os.path.abspath(out)}")