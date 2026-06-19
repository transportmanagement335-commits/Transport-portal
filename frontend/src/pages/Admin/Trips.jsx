import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {FaClipboardList,FaTruckMoving,FaCheckCircle, FaRoute,} from "react-icons/fa";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { tripsAPI, vehiclesAPI, customersAPI, requireAuth, WS_BASE_URL } from "../../api";

import "../../styles/Admin/AdminDashboard.css";
import "../../styles/Admin/Trips.css";
import "../../styles/Admin/TripDetails.css";

// ── Fix Leaflet default marker icons ──────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const getDriverIcon = (driverName) => {
  // Generate a consistent color based on driver name
  const colors = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1"];
  let hash = 0;
  for (let i = 0; i < (driverName || "").length; i++) {
    hash = driverName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  return L.divIcon({
    className: "",
    html: `<div class="live-pulse-wrapper">
      <div class="live-pulse-ring" style="border-color: ${color}"></div>
      <div class="live-pulse-dot" style="background-color: ${color}"></div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

function Trips() {
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  
  // "__manual" is the sentinel value meaning "type manually"
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [manualClient, setManualClient] = useState(false);  // show manual inputs
  
  const [liveLocations, setLiveLocations] = useState({});
  const wsRef = useRef(null);

  const [formData, setFormData] = useState({
    vehicle_id: "",
    client_name: "",
    client_phone: "",
    pickup_location: "",
    drop_location: "",
    reporting_time: "",
    balance_amount: "",
    notes: "",
  });

  useEffect(() => {
    requireAuth();
    fetchTrips();
    fetchVehicles();
    fetchCustomers();
  }, []);

  // Initialize live locations from initial fetch
  useEffect(() => {
    const locs = {};
    trips.forEach(t => {
      if (t.trip_status === "On Trip" && t.driver_lat && t.driver_lng) {
        locs[t.id] = { lat: t.driver_lat, lng: t.driver_lng, ts: t.location_updated_at };
      }
    });
    setLiveLocations(prev => ({ ...locs, ...prev }));
  }, [trips]);

  // Connect to global locations websocket
  useEffect(() => {
    const WS_URL = `${WS_BASE_URL}/all-locations/ws`;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.trip_id) {
          setLiveLocations((prev) => ({
            ...prev,
            [data.trip_id]: { lat: data.lat, lng: data.lng, ts: data.ts }
          }));
        }
      } catch (err) {}
    };

    return () => {
      ws.close();
    };
  }, []);

  async function fetchTrips() {
    try {
      setLoading(true);
      const data = await tripsAPI.list();
      setTrips(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchVehicles() {
    try {
      const data = await vehiclesAPI.list();
      setVehicles(data.filter((v) => v.status === "Active"));
    } catch (err) {
      console.error("Failed to load vehicles:", err);
    }
  }

  async function fetchCustomers() {
    try {
      const data = await customersAPI.list();
      setCustomers(data.filter((c) => c.is_active));
    } catch (err) {
      console.error("Failed to load customers:", err);
    }
  }

  // When a customer is selected from the dropdown, auto-fill name + phone
  function handleCustomerSelect(e) {
    const val = e.target.value;
    setSelectedCustomerId(val);
    if (val === "__manual") {
      // Show manual text inputs, clear any auto-filled values
      setManualClient(true);
      setFormData((prev) => ({ ...prev, client_name: "", client_phone: "" }));
    } else if (val === "") {
      setManualClient(false);
      setFormData((prev) => ({ ...prev, client_name: "", client_phone: "" }));
    } else {
      const customer = customers.find((c) => c.id === val);
      setManualClient(false);
      setFormData((prev) => ({
        ...prev,
        client_name: customer?.name || "",
        client_phone: customer?.phone || "",
      }));
    }
  }

  async function handleCreateTrip() {
    if (
      !formData.client_name ||
      !formData.client_phone ||
      !formData.vehicle_id ||
      !formData.pickup_location ||
      !formData.drop_location ||
      !formData.reporting_time ||
      formData.balance_amount === ""
    ) {
      alert("Please fill all required fields including Trip Cost.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...formData,
        trip_id: `TRIP-${Date.now()}`,
        balance_amount: parseFloat(formData.balance_amount) || 0,
        reporting_time: new Date(formData.reporting_time).toISOString(),
      };

      const created = await tripsAPI.create(payload);
      setTrips([created, ...trips]);

      setFormData({
        vehicle_id: "",
        client_name: "",
        client_phone: "",
        pickup_location: "",
        drop_location: "",
        reporting_time: "",
        balance_amount: "",
        notes: "",
      });
      setSelectedCustomerId("");
      setManualClient(false);
      setShowForm(false);
      fetchVehicles();
      alert("Trip Created! Notifications sent to Driver & Client.");
    } catch (err) {
      alert("Failed to create trip: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearAll() {
    if (!window.confirm("Are you sure you want to delete ALL trips? This cannot be undone.")) return;
    try {
      setLoading(true);
      await tripsAPI.deleteAll();
      setTrips([]);
      fetchVehicles();
    } catch (err) {
      alert("Failed to clear trips: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  const filteredTrips = trips.filter((t) => {
    const q = search.toLowerCase();
    const searchMatch =
      t.client_name?.toLowerCase().includes(q) ||
      t.client_phone?.toLowerCase().includes(q) ||
      t.vehicle_number?.toLowerCase().includes(q) ||
      t.driver_name?.toLowerCase().includes(q);
    const statusMatch = statusFilter === "All" || t.trip_status === statusFilter;
    return searchMatch && statusMatch;
  });

  const scheduledCount = trips.filter((t) => t.trip_status === "Scheduled").length;
  const onTripCount   = trips.filter((t) => t.trip_status === "On Trip").length;
  const completedCount = trips.filter((t) => t.trip_status === "Completed").length;

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />

      <div className={`trips-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {error && (
          <div className="trips-error-banner">⚠ {error}</div>
        )}

        {/* ── Header ── */}
        <div className="trips-header">
          <div>
            <h1>Trips &amp; Bookings</h1>
            <p>Manage all trips, auto-assign drivers, and trigger notifications.</p>
          </div>
          <div className="trips-header-actions">
            <button className="btn-danger" onClick={handleClearAll} disabled={loading || trips.length === 0}>
              Clear All Trips
            </button>
            <button className="btn-trip" onClick={() => setShowForm(!showForm)}>
              {showForm ? "Hide Form" : "+ Create Trip"}
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
          <div className="trips-cards">

    <div className="t-card">
      <div className="trip-icon scheduled">
        <FaClipboardList />
      </div>

      <h3>Scheduled</h3>

      <p>{loading ? "—" : scheduledCount}</p>
    </div>

    <div className="t-card">
      <div className="trip-icon ontrip">
        <FaTruckMoving />
      </div>

      <h3>On Trip</h3>

      <p>{loading ? "—" : onTripCount}</p>
    </div>

    <div className="t-card">
      <div className="trip-icon completed">
        <FaCheckCircle />
      </div>

      <h3>Completed</h3>

      <p>{loading ? "—" : completedCount}</p>
    </div>

    <div className="t-card">
      <div className="trip-icon total">
        <FaRoute />
      </div>

      <h3>Total Trips</h3>

      <p>{loading  ? "—" : trips.length}</p>
    </div>

  </div>

        {/* ── All Drivers Map ── */}
        <div className="trips-map-panel" style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
              🗺 Live Fleet Overview
            </h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "14px" }}>
              Real-time map showing all active drivers who are currently "On Trip".
            </p>
          </div>
          
          <div style={{ height: "400px", width: "100%", borderRadius: "10px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
            <MapContainer
              center={[20.5937, 78.9629]}
              zoom={5}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {Object.entries(liveLocations).map(([tripId, loc]) => {
                const trip = trips.find(t => t.id === tripId);
                if (!trip) return null;
                return (
                  <Marker key={tripId} position={[loc.lat, loc.lng]} icon={getDriverIcon(trip.driver_name)}>
                    <Popup>
                      <strong>🔵 {trip.driver_name || "Unknown"}</strong><br />
                      {trip.vehicle_number}<br />
                      <small style={{ color: "#64748b" }}>{trip.pickup_location} ➔ {trip.drop_location}</small><br />
                      <small style={{ color: "#94a3b8" }}>Last updated: {new Date(loc.ts).toLocaleTimeString()}</small>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>

        {/* ── Create Trip Form ── */}
        {showForm && (
          <div className="trips-form-panel">
            <h2>Create New Trip</h2>
            <p className="trips-form-subtitle">
              Notifications will be sent to the Driver &amp; Client automatically.
            </p>

            <div className="trips-form-grid">
              {/* Customer selector — auto-fills name & phone */}
              <label className="trips-label" style={{ gridColumn: "1 / -1" }}>
                <span>Customer <span className="req">*</span></span>
                <select
                  id="trip-customer-select"
                  className="t-input"
                  value={selectedCustomerId}
                  onChange={handleCustomerSelect}
                  style={{ width: "100%" }}
                >
                  <option value="">-- Select a Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                  <option value="__manual">✏ Enter manually (one-off client)</option>
                </select>
              </label>

              {/* Auto-filled read-only preview OR manual inputs */}
              {selectedCustomerId && selectedCustomerId !== "__manual" && (
                <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <label className="trips-label">
                    <span>Client Name</span>
                    <input
                      className="t-input"
                      value={formData.client_name}
                      readOnly
                      style={{ background: "#f8fafc", color: "#475569", cursor: "not-allowed" }}
                    />
                  </label>
                  <label className="trips-label">
                    <span>Client Phone</span>
                    <input
                      className="t-input"
                      value={formData.client_phone || "—"}
                      readOnly
                      style={{ background: "#f8fafc", color: "#475569", cursor: "not-allowed" }}
                    />
                  </label>
                </div>
              )}

              {/* Manual entry fallback */}
              {manualClient && (
                <>
                  <label className="trips-label">
                    <span>Client Name <span className="req">*</span></span>
                    <input
                      id="trip-client-name"
                      className="t-input"
                      name="client_name"
                      value={formData.client_name}
                      onChange={handleChange}
                      placeholder="e.g. John Doe"
                    />
                  </label>
                  <label className="trips-label">
                    <span>Client Phone <span className="req">*</span></span>
                    <input
                      id="trip-client-phone"
                      className="t-input"
                      name="client_phone"
                      value={formData.client_phone}
                      onChange={handleChange}
                      placeholder="e.g. +919876543210"
                    />
                  </label>
                </>
              )}

              {/* Row 2 */}
              <label className="trips-label">
                <span>Pickup Location <span className="req">*</span></span>
                <input
                  className="t-input"
                  name="pickup_location"
                  value={formData.pickup_location}
                  onChange={handleChange}
                  placeholder="e.g. Mumbai Central"
                />
              </label>
              <label className="trips-label">
                <span>Drop Location <span className="req">*</span></span>
                <input
                  className="t-input"
                  name="drop_location"
                  value={formData.drop_location}
                  onChange={handleChange}
                  placeholder="e.g. Pune Station"
                />
              </label>

              {/* Row 3 */}
              <label className="trips-label">
                <span>Vehicle <span className="req">*</span></span>
                <select
                  className="t-input"
                  name="vehicle_id"
                  value={formData.vehicle_id}
                  onChange={handleChange}
                >
                  <option value="">Select Available Vehicle</option>
                  {vehicles.map((v) => {
                    const bt = v.bus_type ? ` - ${v.bus_type} ${v.bus_category}` : "";
                    const tt = v.truck_category ? ` - ${v.truck_category} ${v.truck_size}` : "";
                    const subtype = v.type === "Bus" ? `Bus${bt}` : v.type === "Truck" ? `Truck${tt}` : v.type;
                    return (
                      <option key={v.id} value={v.id}>
                        {v.number} ({subtype}) — Driver: {v.driver || "None"}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="trips-label">
                <span>Reporting Time <span className="req">*</span></span>
                <input
                  className="t-input"
                  type="datetime-local"
                  name="reporting_time"
                  value={formData.reporting_time}
                  onChange={handleChange}
                />
              </label>
              {/* Row 4 — Balance Amount + Notes */}
              <label className="trips-label">
                <span>Trip Cost / Selling Price (₹) <span className="req">*</span></span>
                <input
                  className="t-input"
                  type="number"
                  name="balance_amount"
                  value={formData.balance_amount}
                  onChange={handleChange}
                  placeholder="e.g. 65000 (total agreed price)"
                  min="0"
                />
              </label>
              <label className="trips-label">
                <span>Special Notes</span>
                <input
                  className="t-input"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Optional instructions"
                />
              </label>
            </div>

            <div className="trips-form-footer">
              <button className="btn-primary" onClick={handleCreateTrip} disabled={saving}>
                {saving ? "Creating & Sending..." : "Create Trip"}
              </button>
            </div>
          </div>
        )}

        {/* ── Filter Bar ── */}
        <div className="trips-filter-bar">
          <input
            className="t-input"
            placeholder="Search by client, phone, vehicle, or driver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="t-input trips-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="On Trip">On Trip</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        {/* ── Table ── */}
        <div className="trips-table-panel">
          {loading ? (
            <p className="trips-empty">Loading trips...</p>
          ) : filteredTrips.length === 0 ? (
            <p className="trips-empty">No trips found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Client</th>
                  <th>Vehicle &amp; Driver</th>
                  <th>Route</th>
                  <th>Reporting Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.map((trip, idx) => (
                  <tr key={trip.id || idx}>
                    <td>
                      <div className="trips-trip-id">{trip.trip_id}</div>
                    </td>
                    <td>
                      <div className="trips-cell-primary">{trip.client_name}</div>
                      <div className="trips-cell-secondary">{trip.client_phone}</div>
                    </td>
                    <td>
                      <div className="trips-cell-primary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {trip.vehicle_number}
                        {["truck", "container", "flatbed", "refrigerated", "heavy-duty", "heavy", "lorry"].some(k => (trip.vehicle_type || "").toLowerCase().includes(k)) && (
                          (trip.eway_bill && trip.gr_number) 
                            ? <span title="Freight docs complete" style={{ fontSize: "14px" }}>✅</span> 
                            : <span title="Missing freight docs" style={{ fontSize: "14px" }}>⚠️</span>
                        )}
                      </div>
                      <div className="trips-cell-secondary">{trip.driver_name}</div>
                    </td>
                    <td>
                      <div className="trips-cell-route">{trip.pickup_location} ➔</div>
                      <div className="trips-cell-route">{trip.drop_location}</div>
                    </td>
                    <td className="trips-cell-date">
                      {new Date(trip.reporting_time).toLocaleString(undefined, {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <span className={`status-badge ${
                        trip.trip_status === "Scheduled"  ? "active"      :
                        trip.trip_status === "On Trip"    ? "booked"      :
                        trip.trip_status === "Cancelled"  ? "maintenance" : "active"
                      }`}>
                        {trip.trip_status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => navigate("/trip-details", { state: { trip } })}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}

export default Trips;
