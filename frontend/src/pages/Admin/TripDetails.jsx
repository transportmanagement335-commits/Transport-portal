import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { tripsAPI, expensesAPI, vehiclesAPI, invoicesAPI, WS_BASE_URL, SERVER_URL, requireAuth } from "../../api";
import "../../styles/Admin/AdminDashboard.css";
import "../../styles/Admin/Trips.css";
import "../../styles/Admin/TripDetails.css";

// ── Fix Leaflet default marker icons (broken with bundlers) ──────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom coloured markers
const makeIcon = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);">
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const greenIcon  = makeIcon("#10b981");
const redIcon    = makeIcon("#ef4444");
const blueIcon   = makeIcon("#3b82f6");
const pulseIcon  = L.divIcon({
  className: "",
  html: `<div class="live-pulse-wrapper">
    <div class="live-pulse-ring"></div>
    <div class="live-pulse-dot"></div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Helper: auto-pan map to new driver position
function PanToDriver({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.5 });
  }, [pos, map]);
  return null;
}

// Helper: geocode an address string via Nominatim
async function geocode(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) { console.error(err); }
  return null;
}

// Helper: fetch driving route via OSRM (free, no API key)
async function fetchRoute(from, to) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.code === "Ok" && data.routes?.[0]) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    }
  } catch (err) { console.error(err); }
  return [];
}

const DUTY_ACTIONS = [
  "Departed",
  "Reached Checkpoint",
  "Loading Complete",
  "Unloading Started",
  "Break",
  "Fuel Stop",
  "Reached Destination",
  "Delay",
  "Issue Reported",
  "Other",
];

// ── Determine if a vehicle type is a truck ────────────────────────────────────
const TRUCK_KEYWORDS = ["truck", "container", "flatbed", "refrigerated", "heavy-duty", "heavy"];
function isTruck(type = "") {
  return TRUCK_KEYWORDS.some((k) => type.toLowerCase().includes(k));
}
function isBus(type = "") {
  return ["seater", "bus", "ac", "non-ac", "sleeper"].some((k) => type.toLowerCase().includes(k));
}

// ─────────────────────────────────────────────────────────────────────────────

function TripDetails() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const passedTrip = location.state?.trip || null;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editMode, setEditMode]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [tripData, setTripData]       = useState(passedTrip);
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);

  // ── Live tracking ────────────────────────────────────────
  const [driverPos, setDriverPos]         = useState(null); // { lat, lng }
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [secAgo, setSecAgo]               = useState(null);
  const [pickupPos, setPickupPos]         = useState(null);
  const [dropPos, setDropPos]             = useState(null);
  const [routePoints, setRoutePoints]     = useState([]);   // OSRM polyline
  const [gpsStatus, setGpsStatus]         = useState("waiting");
  const wsRef = useRef(null);

  // ── Duty log ─────────────────────────────────────────────────────────────
  const [showLogForm, setShowLogForm]   = useState(false);
  const [logAction, setLogAction]       = useState(DUTY_ACTIONS[0]);
  const [logNote, setLogNote]           = useState("");
  const [logSaving, setLogSaving]       = useState(false);

  // ── Expenses ─────────────────────────────────────────────────────────────
  const [expenses, setExpenses]             = useState([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm]       = useState({ category: "Fuel", amount: "", notes: "" });
  const [expenseSaving, setExpenseSaving]   = useState(false);

  // ── Freight Docs ─────────────────────────────────────────────────────────
  const [freightDocsMode, setFreightDocsMode] = useState(false);
  const [freightSaving, setFreightSaving]     = useState(false);
  const [freightForm, setFreightForm]         = useState({ eway_bill: "", gr_number: "" });
  const [freightErrors, setFreightErrors]     = useState({});

  useEffect(() => {
    if (tripData) {
      setFreightForm({ eway_bill: tripData.eway_bill || "", gr_number: tripData.gr_number || "" });
    }
  }, [tripData]);

  const validateFreightDocs = (field, value) => {
    let err = "";
    if (field === "eway_bill" && value) {
      if (!/^\d{12}$/.test(value)) err = "E-way bill must be exactly 12 digits.";
    }
    if (field === "gr_number" && value) {
      if (value.length < 3 || value.length > 50) err = "GR number must be between 3 and 50 characters.";
    }
    setFreightErrors(prev => ({ ...prev, [field]: err }));
    return err;
  };

  const handleFreightChange = (field, value) => {
    setFreightForm(prev => ({ ...prev, [field]: value }));
    validateFreightDocs(field, value);
  };

  const saveFreightDocs = async () => {
    const eErr = validateFreightDocs("eway_bill", freightForm.eway_bill);
    const gErr = validateFreightDocs("gr_number", freightForm.gr_number);
    if (eErr || gErr) return;

    try {
      setFreightSaving(true);
      const updated = await tripsAPI.updateFreightDocs(tripData.id, {
        eway_bill: freightForm.eway_bill || null,
        gr_number: freightForm.gr_number || null
      });
      setTripData(updated);
      setFreightDocsMode(false);
    } catch (err) {
      alert("Failed to save freight docs: " + err.message);
    } finally {
      setFreightSaving(false);
    }
  };

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    requireAuth();
    if (passedTrip?.id) {
      tripsAPI.get(passedTrip.id)
        .then((data) => {
          setTripData(data);
          // Seed GPS if already stored
          if (data.driver_lat && data.driver_lng) {
            setDriverPos({ lat: data.driver_lat, lng: data.driver_lng });
            setLastUpdated(data.location_updated_at);
          }
        })
        .catch(() => {});

      expensesAPI.getByTrip(passedTrip.id)
        .then(res => setExpenses(res))
        .catch(() => {});
    }
  }, []);

  // ── Geocode pickup + drop ─────────────────────────────────────
  useEffect(() => {
    if (!tripData) return;
    async function buildRoute() {
      const [pPos, dPos] = await Promise.all([
        geocode(tripData.pickup_location),
        geocode(tripData.drop_location),
      ]);
      setPickupPos(pPos);
      setDropPos(dPos);
      if (pPos && dPos) {
        const route = await fetchRoute(pPos, dPos);
        setRoutePoints(route);
      }
    }
    buildRoute();
  }, [tripData?.pickup_location, tripData?.drop_location]);

  // ── WebSocket for real-time GPS ───────────────────────────────────────────
  useEffect(() => {
    if (!tripData?.id) return;

    const WS_URL = `${WS_BASE_URL}/trips/${tripData.id}/location/ws`;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected to live tracking for trip", tripData.id);
    };

    ws.onmessage = (e) => {
      try {
        const { lat, lng, ts } = JSON.parse(e.data);
        setDriverPos({ lat, lng });
        setLastUpdated(ts);
        setGpsStatus("live");
      } catch (err) { console.error(err); }
    };

    ws.onerror = () => setGpsStatus("stale");
    ws.onclose = () => console.log("[WS] Disconnected from live tracking");

    return () => {
      ws.close();
    };
  }, [tripData?.id]);

  // ── "X seconds ago" counter ───────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      if (!lastUpdated) return;
      const diff = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000);
      setSecAgo(diff);
      setGpsStatus(diff > 30 ? "stale" : "live");
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  if (!tripData) {
    return <div className="trips-empty" style={{ padding: "40px" }}>Loading trip data...</div>;
  }

  // ── Save edits ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!editMode) { setEditMode(true); return; }
    try {
      setSaving(true);
      const updated = await tripsAPI.update(tripData.id, {
        client_name:     tripData.client_name,
        client_phone:    tripData.client_phone,
        pickup_location: tripData.pickup_location,
        drop_location:   tripData.drop_location,
        reporting_time:  tripData.reporting_time,
        balance_amount:  parseFloat(tripData.balance_amount) || 0,
        payment_status:  tripData.payment_status,
        trip_status:     tripData.trip_status,
        notes:           tripData.notes,
        permit_number:   tripData.permit_number,
        passing_info:    tripData.passing_info,
      });
      setTripData(updated);
      setEditMode(false);
    } catch (err) {
      setError("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Auto-Generate Invoice ──────────────────────────────────────────────────
  async function handleGenerateInvoice() {
    try {
      setInvoiceGenerating(true);
      const invoice = await invoicesAPI.fromTrip(tripData.id);
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      alert("Failed to generate invoice: " + (err.response?.data?.detail || err.message));
    } finally {
      setInvoiceGenerating(false);
    }
  }

  // ── Add duty log entry ────────────────────────────────────────────────────
  async function handleAddLog() {
    if (!logAction) return;
    try {
      setLogSaving(true);
      const updated = await tripsAPI.addDutyLog(tripData.id, { action: logAction, note: logNote });
      setTripData(updated);
      setLogAction(DUTY_ACTIONS[0]);
      setLogNote("");
      setShowLogForm(false);
    } catch (err) {
      alert("Failed to add log: " + err.message);
    } finally {
      setLogSaving(false);
    }
  }

  // ── Add expense ────────────────────────────────────────────────────────────
  async function handleAddExpense(e) {
    e.preventDefault();
    if (!expenseForm.amount) return;
    try {
      setExpenseSaving(true);
      await expensesAPI.create({
        vehicle_id: tripData.vehicle_id || "",
        trip_id: tripData.id,
        category: expenseForm.category,
        amount: parseFloat(expenseForm.amount),
        notes: expenseForm.notes
      });
      const updated = await expensesAPI.getByTrip(tripData.id);
      setExpenses(updated);
      setShowExpenseForm(false);
      setExpenseForm({ category: "Fuel", amount: "", notes: "" });
    } catch (err) {
      alert("Failed to add expense: " + err.message);
    } finally {
      setExpenseSaving(false);
    }
  }

  // ── Field renderer (view / edit) ──────────────────────────────────────────
  function field(label, key, isDate = false) {
    return (
      <div className="td-detail-box">
        <p>{label}</p>
        {editMode ? (
          <input
            className="t-input"
            type={isDate ? "datetime-local" : "text"}
            value={
              isDate && tripData[key]
                ? new Date(tripData[key]).toISOString().slice(0, 16)
                : tripData[key] || ""
            }
            onChange={(e) => setTripData({ ...tripData, [key]: e.target.value })}
          />
        ) : (
          <h4>
            {isDate && tripData[key]
              ? new Date(tripData[key]).toLocaleString()
              : tripData[key] || "—"}
          </h4>
        )}
      </div>
    );
  }

  const msgStatus = (label, sent) => (
    <div className="td-row">
      <span>{label}</span>
      <span className={sent ? "msg-sent" : "msg-failed"}>
        {sent ? "✓ Sent" : "✗ Failed"}
      </span>
    </div>
  );

  const vehicleType = tripData.vehicle_type || "";
  const showTruckPanel = isTruck(vehicleType);
  const showBusPanel   = isBus(vehicleType) || tripData.permit_number;

  const mapCenter = driverPos
    || pickupPos
    || { lat: 20.5937, lng: 78.9629 }; // fallback: centre of India

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />

      <div className={`trips-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {error && <div className="trips-error-banner">⚠ {error}</div>}

        {/* ── Header ── */}
        <div className="trips-header">
          <div>
            <h1>Trip Details</h1>
            <p>Dashboard &gt; Trips &gt; <span style={{ color: "#3b82f6" }}>{tripData.trip_id}</span></p>
          </div>
          <div className="trips-header-actions">
            <button className="btn-danger" onClick={() => navigate("/trips")}>← Back</button>
            {tripData.trip_status === "Completed" && (
              <button 
                className="btn-primary" 
                style={{ backgroundColor: "#10b981" }} 
                onClick={handleGenerateInvoice} 
                disabled={invoiceGenerating}
              >
                {invoiceGenerating ? "Generating..." : "🧾 Generate Invoice"}
              </button>
            )}
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editMode ? "Save Changes" : "Edit Trip"}
            </button>
          </div>
        </div>

        {/* ── Top Grid: Trip Info + Assigned Resource ── */}
        <div className="td-grid-top">
          {/* Trip Info */}
          <div className="td-panel">
            <h2>Trip Info</h2>
            <div className="td-details-grid">
              {field("Client Name",     "client_name")}
              {field("Client Phone",    "client_phone")}
              {field("Pickup Location", "pickup_location")}
              {field("Drop Location",   "drop_location")}
              {field("Reporting Time",  "reporting_time", true)}

              <div className="td-detail-box">
                <p>Trip Status</p>
                {editMode ? (
                  <select
                    className="t-input"
                    value={tripData.trip_status}
                    onChange={(e) => setTripData({ ...tripData, trip_status: e.target.value })}
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="On Trip">On Trip</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                ) : (
                  <h4>
                    <span className={`status-badge ${
                      tripData.trip_status === "Scheduled"  ? "active"      :
                      tripData.trip_status === "On Trip"    ? "booked"      :
                      tripData.trip_status === "Cancelled"  ? "maintenance" : "active"
                    }`}>
                      {tripData.trip_status}
                    </span>
                  </h4>
                )}
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              {field("Special Notes", "notes")}
            </div>
          </div>

          {/* Assigned Resource + Message Status */}
          <div className="td-panel">
            <h2>Assigned Resource</h2>
            <div className="td-row">
              <span>Vehicle</span>
              <span>{tripData.vehicle_number} ({tripData.vehicle_type})</span>
            </div>
            <div className="td-row">
              <span>Driver Name</span>
              <span>{tripData.driver_name || "—"}</span>
            </div>
            <div className="td-row">
              <span>Driver Phone</span>
              <span>{tripData.driver_phone || "—"}</span>
            </div>

            <div className="td-divider" />
            <h2>Notification Status</h2>
            {msgStatus("Driver Notified",  tripData.driver_msg_sent)}
            {msgStatus("Client Notified",  tripData.client_msg_sent)}
            <p className="td-hint">
              * Duty reminders auto-schedule 2hr &amp; 1hr before reporting time.
            </p>
          </div>
        </div>

        {/* ── Bottom Grid: Payment + Activity ── */}
        <div className="td-grid-bottom">
          {/* Payment Details */}
          <div className="td-panel">
            <h2>Payment Details</h2>
            <div className="td-row">
              <span>Balance Amount</span>
              {editMode ? (
                <input
                  className="t-input"
                  style={{ width: "140px" }}
                  type="number"
                  value={tripData.balance_amount}
                  onChange={(e) => setTripData({ ...tripData, balance_amount: e.target.value })}
                />
              ) : (
                <span>₹{tripData.balance_amount?.toLocaleString()}</span>
              )}
            </div>
            <div className="td-row">
              <span>Payment Status</span>
              {editMode ? (
                <select
                  className="t-input"
                  style={{ width: "140px" }}
                  value={tripData.payment_status}
                  onChange={(e) => setTripData({ ...tripData, payment_status: e.target.value })}
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                </select>
              ) : (
                <span className={`status-badge ${tripData.payment_status === "Paid" ? "active" : "booked"}`}>
                  {tripData.payment_status}
                </span>
              )}
            </div>

            {tripData.payment_link && (
              <div className="td-payment-link">
                <p>Razorpay Link (sent to client)</p>
                <a href={tripData.payment_link} target="_blank" rel="noreferrer">
                  {tripData.payment_link}
                </a>
              </div>
            )}
          </div>

          {/* Lifecycle & Metrics */}
          <div className="td-panel">
            <h2>Lifecycle & Metrics</h2>
            <div className="td-row">
              <span>Started At</span>
              <span style={{ color: "#3b82f6", fontWeight: "600" }}>{tripData.started_at ? new Date(tripData.started_at).toLocaleString() : "Not Started"}</span>
            </div>
            <div className="td-row">
              <span>Completed At</span>
              <span style={{ color: "#10b981", fontWeight: "600" }}>{tripData.completed_at ? new Date(tripData.completed_at).toLocaleString() : "Not Completed"}</span>
            </div>
            {tripData.started_at && tripData.completed_at && (
              <div className="td-row">
                <span>Time Taken</span>
                <span style={{ fontWeight: "600" }}>
                  {Math.round((new Date(tripData.completed_at) - new Date(tripData.started_at)) / 60000)} mins
                </span>
              </div>
            )}
            {tripData.distance_travelled_km != null && (
              <div className="td-row">
                <span>Distance Travelled</span>
                <span style={{ fontWeight: "600" }}>{tripData.distance_travelled_km.toFixed(1)} km</span>
              </div>
            )}
            <div className="td-divider" style={{ margin: "12px 0", borderBottom: "1px solid #e2e8f0" }} />
            <div className="td-row">
              <span>Trip Created On</span>
              <span>{new Date(tripData.created_at).toLocaleString()}</span>
            </div>
            <div className="td-row">
              <span>Trip ID</span>
              <span style={{ color: "#64748b" }}>{tripData.trip_id}</span>
            </div>
          </div>
        </div>

        {/* ── Expenses & Profit ── */}
        <div className="td-extra-panel">
          <div className="td-extra-header">
            <span className="td-extra-icon">💰</span>
            <div>
              <h2>Expenses &amp; Profit</h2>
              <p>Track fuel, tolls, driver payments, etc. Profit = Revenue - Expenses.</p>
            </div>
            <button
              className="btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={() => setShowExpenseForm(!showExpenseForm)}
            >
              {showExpenseForm ? "Cancel" : "+ Add Expense"}
            </button>
          </div>

          {showExpenseForm && (
            <form className="td-log-form" onSubmit={handleAddExpense}>
              <select
                className="t-input"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                style={{ flex: "0 0 160px" }}
                required
              >
                <option value="Fuel">Fuel</option>
                <option value="Driver Payment">Driver Payment</option>
                <option value="Tolls">Tolls</option>
                <option value="Parking">Parking</option>
                <option value="Service & Repair">Service & Repair</option>
                <option value="Miscellaneous">Miscellaneous</option>
              </select>
              <input
                className="t-input"
                type="number"
                placeholder="Amount (₹)"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                style={{ flex: "0 0 120px" }}
                required
              />
              <input
                className="t-input"
                placeholder="Notes (optional)"
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={expenseSaving}
              >
                {expenseSaving ? "Saving…" : "Save"}
              </button>
            </form>
          )}

          <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", marginTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "14px", color: "#64748b", fontWeight: 600 }}>Expense Category</div>
              <div style={{ fontSize: "14px", color: "#64748b", fontWeight: 600 }}>Amount</div>
            </div>
            {expenses.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "12px 0" }}>No expenses logged yet.</div>
            ) : (
              expenses.map((exp, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div>
                    <strong style={{ color: "#334155" }}>{exp.category}</strong>
                    {exp.notes && <span style={{ color: "#64748b", fontSize: "12px", marginLeft: "8px" }}>- {exp.notes}</span>}
                    <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                      {new Date(exp.date).toLocaleDateString()} by {exp.recorded_by}
                      {exp.receipt_url && <a href={`${SERVER_URL}${exp.receipt_url}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: "#3b82f6", textDecoration: "none" }}>🧾 View Receipt</a>}
                      {exp.location_lat && <a href={`https://maps.google.com/?q=${exp.location_lat},${exp.location_lng}`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: "#10b981", textDecoration: "none" }}>📍 Geotagged</a>}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, color: "#ef4444" }}>₹{exp.amount.toLocaleString()}</div>
                </div>
              ))
            )}
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", paddingTop: "12px", borderTop: "2px solid #e2e8f0", fontSize: "16px" }}>
              <strong style={{ color: "#1e293b" }}>Total Expenses</strong>
              <strong style={{ color: "#ef4444" }}>
                ₹{expenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "16px" }}>
              <strong style={{ color: "#1e293b" }}>Total Revenue</strong>
              <strong style={{ color: "#10b981" }}>
                ₹{(parseFloat(tripData.trip_cost) || (parseFloat(tripData.balance_amount) || 0) + (parseFloat(tripData.amount_paid) || 0)).toLocaleString()}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "14px" }}>
              <span style={{ color: "#64748b" }}>Amount Paid: ₹{(parseFloat(tripData.amount_paid) || 0).toLocaleString()}</span>
              <span style={{ color: "#64748b" }}>Balance: ₹{(parseFloat(tripData.balance_amount) || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", padding: "12px", backgroundColor: "#eff6ff", borderRadius: "6px", fontSize: "18px" }}>
              <strong style={{ color: "#1e293b" }}>Auto-Profit</strong>
              <strong style={{ color: ((parseFloat(tripData.trip_cost) || (parseFloat(tripData.balance_amount) || 0) + (parseFloat(tripData.amount_paid) || 0)) - expenses.reduce((sum, e) => sum + e.amount, 0)) >= 0 ? "#10b981" : "#ef4444" }}>
                ₹{((parseFloat(tripData.trip_cost) || (parseFloat(tripData.balance_amount) || 0) + (parseFloat(tripData.amount_paid) || 0)) - expenses.reduce((sum, e) => sum + e.amount, 0)).toLocaleString()}
              </strong>
            </div>
          </div>
        </div>

        {/* ── Freight Documentation Panel (trucks only) ── */}
        {showTruckPanel && (
          <div className="td-extra-panel" style={{ border: "1px solid #cbd5e1" }}>
            <div className="td-extra-header" style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "16px" }}>
              <span className="td-extra-icon" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>📄</span>
              <div>
                <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  Freight Documentation
                  {(!tripData.eway_bill || !tripData.gr_number) && <span style={{ fontSize: "12px", padding: "2px 8px", background: "#fef3c7", color: "#d97706", borderRadius: "12px", fontWeight: 600 }}>Action Required</span>}
                </h2>
                <p>Official logistics documents for checkpost verification.</p>
              </div>
              <div style={{ marginLeft: "auto" }}>
                {freightDocsMode ? (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-danger" onClick={() => { setFreightDocsMode(false); setFreightForm({ eway_bill: tripData.eway_bill || "", gr_number: tripData.gr_number || "" }); setFreightErrors({}); }} disabled={freightSaving}>Cancel</button>
                    <button className="btn-primary" onClick={saveFreightDocs} disabled={freightSaving}>{freightSaving ? "Saving..." : "Save Docs"}</button>
                  </div>
                ) : (
                  <button className="btn-trip" onClick={() => setFreightDocsMode(true)}>Edit</button>
                )}
              </div>
            </div>
            
            <div className="td-doc-grid">
              {/* E-way Bill */}
              <div className="td-doc-box eway" style={{ background: "white", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div className="td-doc-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  E-way Bill Number
                  <span title="This is a government-issued 12-digit number from ewaybillgst.gov.in. As a software provider, we do not generate this — your transport company must obtain it from the GST portal." style={{ cursor: "help", color: "#94a3b8" }}>ℹ️</span>
                </div>
                {freightDocsMode ? (
                  <div style={{ marginTop: "8px" }}>
                    <input
                      className="t-input"
                      value={freightForm.eway_bill}
                      onChange={(e) => handleFreightChange("eway_bill", e.target.value)}
                      placeholder="Enter 12-digit E-way Bill from GST portal"
                      style={{ borderColor: freightErrors.eway_bill ? "#ef4444" : "#e2e8f0", width: "100%" }}
                    />
                    {freightErrors.eway_bill && <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{freightErrors.eway_bill}</div>}
                  </div>
                ) : (
                  <div className="td-doc-value" style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    {tripData.eway_bill || <span style={{ color: "#94a3b8", fontWeight: 400 }}>Not entered</span>}
                    {tripData.eway_bill?.startsWith("EWB-DEMO") && <span style={{ fontSize: "10px", padding: "2px 6px", background: "#f1f5f9", color: "#64748b", borderRadius: "4px" }}>DEMO DATA</span>}
                  </div>
                )}
              </div>
              
              {/* GR Number */}
              <div className="td-doc-box gr" style={{ background: "white", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div className="td-doc-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  GR / LR Number
                  <span title="This is the Lorry Receipt (LR) number provided by your transporter when goods are picked up." style={{ cursor: "help", color: "#94a3b8" }}>ℹ️</span>
                </div>
                {freightDocsMode ? (
                  <div style={{ marginTop: "8px" }}>
                    <input
                      className="t-input"
                      value={freightForm.gr_number}
                      onChange={(e) => handleFreightChange("gr_number", e.target.value)}
                      placeholder="Enter LR number from transporter receipt"
                      style={{ borderColor: freightErrors.gr_number ? "#ef4444" : "#e2e8f0", width: "100%" }}
                    />
                    {freightErrors.gr_number && <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>{freightErrors.gr_number}</div>}
                  </div>
                ) : (
                  <div className="td-doc-value" style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    {tripData.gr_number || <span style={{ color: "#94a3b8", fontWeight: 400 }}>Not entered</span>}
                    {tripData.gr_number?.startsWith("GR-DEMO") && <span style={{ fontSize: "10px", padding: "2px 6px", background: "#f1f5f9", color: "#64748b", borderRadius: "4px" }}>DEMO DATA</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Permit & Passing Panel (buses only) ── */}
        {showBusPanel && (
          <div className="td-extra-panel">
            <div className="td-extra-header">
              <span className="td-extra-icon">🚌</span>
              <div>
                <h2>Permit &amp; Passing Details</h2>
                <p>Bus permit number and checkpoint / passing information.</p>
              </div>
            </div>
            <div className="td-doc-grid">
              <div className="td-doc-box permit">
                <div className="td-doc-label">Permit Number</div>
                {editMode ? (
                  <input
                    className="t-input"
                    value={tripData.permit_number || ""}
                    onChange={(e) => setTripData({ ...tripData, permit_number: e.target.value })}
                    placeholder="e.g. MH-BUS-2024-8821"
                  />
                ) : (
                  <div className="td-doc-value">{tripData.permit_number || "—"}</div>
                )}
              </div>
              <div className="td-doc-box passing">
                <div className="td-doc-label">Passing / Checkpoints</div>
                {editMode ? (
                  <input
                    className="t-input"
                    value={tripData.passing_info || ""}
                    onChange={(e) => setTripData({ ...tripData, passing_info: e.target.value })}
                    placeholder="e.g. Khopoli Toll, Khalapur Naka"
                  />
                ) : (
                  <div className="td-doc-value">{tripData.passing_info || "—"}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Live Tracking Map ── */}
        <div className="td-extra-panel td-map-panel">
          <div className="td-extra-header">
            <span className="td-extra-icon">🗺</span>
            <div>
              <h2>Live Vehicle Tracking</h2>
              <p>Real-time GPS position updates every ~1 second from the driver's device.</p>
            </div>
            {/* Status badge */}
            <div className="td-gps-badge-wrap">
              {gpsStatus === "live" && (
                <span className="td-gps-badge live">
                  <span className="td-gps-dot" /> Live
                  {secAgo !== null && ` · ${secAgo}s ago`}
                </span>
              )}
              {gpsStatus === "stale" && (
                <span className="td-gps-badge stale">
                  ⚠ Stale {secAgo !== null && `· ${secAgo}s ago`}
                </span>
              )}
              {gpsStatus === "waiting" && (
                <span className="td-gps-badge waiting">⏳ Waiting for GPS…</span>
              )}
            </div>
          </div>

          <div className="td-map-container">
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={driverPos ? 14 : 6}
              style={{ height: "380px", width: "100%", borderRadius: "10px" }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Route polyline (OSRM) */}
              {routePoints.length > 0 && (
                <Polyline
                  positions={routePoints}
                  color="#3b82f6"
                  weight={4}
                  opacity={0.75}
                  dashArray="8, 5"
                />
              )}

              {/* Pickup pin */}
              {pickupPos && (
                <Marker position={[pickupPos.lat, pickupPos.lng]} icon={greenIcon}>
                  <Popup>
                    <strong>🟢 Pickup</strong><br />{tripData.pickup_location}
                  </Popup>
                </Marker>
              )}

              {/* Drop pin */}
              {dropPos && (
                <Marker position={[dropPos.lat, dropPos.lng]} icon={redIcon}>
                  <Popup>
                    <strong>🔴 Drop</strong><br />{tripData.drop_location}
                  </Popup>
                </Marker>
              )}

              {/* Live driver marker */}
              {driverPos && (
                <Marker position={[driverPos.lat, driverPos.lng]} icon={pulseIcon}>
                  <Popup>
                    <strong>🔵 {tripData.driver_name}</strong><br />
                    {tripData.vehicle_number}<br />
                    <small>Updated {secAgo !== null ? `${secAgo}s ago` : "just now"}</small>
                  </Popup>
                </Marker>
              )}

              <PanToDriver pos={driverPos} />
            </MapContainer>

            {!driverPos && (
              <div className="td-map-overlay">
                <div className="td-map-waiting">
                  <div className="td-map-waiting-spinner" />
                  <p>Waiting for driver to share location…</p>
                  <small>Driver must have an active "On Trip" trip and GPS enabled in their browser.</small>
                </div>
              </div>
            )}
          </div>

          {/* Map legend */}
          <div className="td-map-legend">
            <span><span style={{ color: "#10b981" }}>●</span> Pickup</span>
            <span><span style={{ color: "#ef4444" }}>●</span> Drop</span>
            <span><span style={{ color: "#3b82f6" }}>●</span> Driver (live)</span>
          </div>
        </div>

        {/* ── Driver Duty Log ── */}
        <div className="td-extra-panel">
          <div className="td-extra-header">
            <span className="td-extra-icon">📋</span>
            <div>
              <h2>Driver Duty Log</h2>
              <p>Chronological log of trip events and driver actions.</p>
            </div>
            <button
              className="btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={() => setShowLogForm(!showLogForm)}
            >
              {showLogForm ? "Cancel" : "+ Add Entry"}
            </button>
          </div>

          {/* Add log entry form */}
          {showLogForm && (
            <div className="td-log-form">
              <select
                className="t-input"
                value={logAction}
                onChange={(e) => setLogAction(e.target.value)}
                style={{ flex: "0 0 220px" }}
              >
                {DUTY_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <input
                className="t-input"
                placeholder="Optional note (e.g. delay due to traffic)"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="btn-primary"
                onClick={handleAddLog}
                disabled={logSaving}
              >
                {logSaving ? "Saving…" : "Log Entry"}
              </button>
            </div>
          )}

          {/* Timeline */}
          <div className="td-log-timeline">
            {(!tripData.duty_log || tripData.duty_log.length === 0) ? (
              <div className="td-log-empty">No log entries yet. Add the first entry above.</div>
            ) : (
              [...tripData.duty_log].reverse().map((entry, i) => (
                <div className="td-log-entry" key={i}>
                  <div className="td-log-dot" />
                  <div className="td-log-content">
                    <div className="td-log-action">{entry.action}</div>
                    <div className="td-log-meta">
                      {entry.logged_by && <span>by {entry.logged_by}</span>}
                      <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ""}</span>
                    </div>
                    {entry.note && <div className="td-log-note">{entry.note}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default TripDetails;
