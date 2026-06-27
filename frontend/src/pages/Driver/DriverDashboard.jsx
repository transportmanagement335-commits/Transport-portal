import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import DriverNavbar from "../../components/Driver/DriverNavbar";
import DriverSidebar from "../../components/Driver/DriverSidebar";

import { driverAPI, tripsAPI, expensesAPI, uploadAPI, requireAuth, logout, WS_BASE_URL } from "../../api";
import "../../styles/Driver/DriverDashboard.css";


// ── Fix Leaflet default icons ─────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Custom icons ──────────────────────────────────────────────────────────────
const makePin = (color, label) =>
  L.divIcon({
    className: "",
    html: `<div style="
      display:flex;flex-direction:column;align-items:center;
    ">
      <div style="
        background:${color};color:white;
        padding:4px 10px;border-radius:20px;
        font-size:12px;font-weight:700;white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        font-family:Inter,sans-serif;
      ">${label}</div>
      <div style="
        width:0;height:0;
        border-left:8px solid transparent;
        border-right:8px solid transparent;
        border-top:10px solid ${color};
        margin-top:-1px;
      "></div>
    </div>`,
    iconSize: [80, 40],
    iconAnchor: [40, 40],
  });

const pickupIcon = makePin("#10b981", "📦 Pickup");
const dropIcon   = makePin("#ef4444", "🏁 Drop");
const driverIcon = L.divIcon({
  className: "",
  html: `<div class="drv-pulse-wrapper">
    <div class="drv-pulse-ring"></div>
    <div class="drv-pulse-dot">🚗</div>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// ── Auto-fit bounds to markers (Only on load or phase change) ─────────────────
function FitBounds({ points, routingPhase, hasDriverPos }) {
  const map = useMap();
  const lastKey = useRef("");

  useEffect(() => {
    if (points.length === 0) return;
    
    // Only re-fit when the phase changes or when we finally get the first GPS lock
    const currentKey = `${routingPhase}_${hasDriverPos}`;
    if (lastKey.current !== currentKey) {
      if (points.length >= 2) {
        map.fitBounds(L.latLngBounds(points), { padding: [50, 50], animate: true });
      } else if (points.length === 1) {
        map.setView(points[0], 13, { animate: true });
      }
      lastKey.current = currentKey;
    }
  }, [points, routingPhase, hasDriverPos, map]);
  
  return null;
}

// ── PanToDriver removed to prevent fighting manual user panning ────────────────

// ── Geocode via Nominatim ─────────────────────────────────────────────────────
async function geocode(address) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {}
  return null;
}

// ── Fetch route polyline via OSRM (free, no key) ─────────────────────────────
async function fetchRoutePoints(points) {
  try {
    const validPoints = points.filter(Boolean);
    if (validPoints.length < 2) return { coords: [], distance: 0 };
    
    const coordsStr = validPoints.map(p => `${p[1]},${p[0]}`).join(";"); // OSRM is lng,lat
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
    
    const res  = await fetch(url);
    const data = await res.json();
    if (data.code === "Ok" && data.routes?.[0]) {
      const coords = data.routes[0].geometry.coordinates;
      const distance = data.routes[0].distance; // distance in meters
      return { coords: coords.map(([lng, lat]) => [lat, lng]), distance }; // leaflet needs [lat,lng]
    }
  } catch {}
  return { coords: [], distance: 0 };
}

// ── Haversine distance in meters ──────────────────────────────────────────────
function haversineDistance(pos1, pos2) {
  if (!pos1 || !pos2) return Infinity;
  const toRad = x => x * Math.PI / 180;
  const R = 6371e3; // metres
  const dLat = toRad(pos2[0] - pos1[0]);
  const dLon = toRad(pos2[1] - pos1[1]);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(pos1[0])) * Math.cos(toRad(pos2[0])) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─────────────────────────────────────────────────────────────────────────────

function DriverDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const [stats, setStats]               = useState(null);
  const [trip, setTrip]                 = useState(null);
  const [loading, setLoading]           = useState(window.innerWidth > 768);
  const [error, setError]               = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm]   = useState({ category: "Fuel", amount: "", notes: "" });
  const [receiptFile, setReceiptFile]   = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const recognitionRef = useRef(null);

  // Docs Modal State
  const [showDocsModal, setShowDocsModal] = useState(false);

  // Map state
  const [pickupPos, setPickupPos]       = useState(null);   // [lat, lng]
  const [dropPos, setDropPos]           = useState(null);   // [lat, lng]
  const [pickupSegmentPoints, setPickupSegmentPoints] = useState([]); // driver -> pickup
  const [dropSegmentPoints, setDropSegmentPoints] = useState([]);     // pickup -> drop or driver -> drop
  const [driverPos, setDriverPos]       = useState(null);   // [lat, lng]
  const [routingPhase, setRoutingPhase] = useState("pickup"); // "pickup" | "drop"
  const [tripTotalDistance, setTripTotalDistance] = useState(0); // in meters

  // GPS sharing
  const [gpsStatus, setGpsStatus]       = useState("idle");
  const gpsIntervalRef                  = useRef(null);

  // WebSocket
  const wsRef = useRef(null);

  // ── Load data ───────────────────────────────────────────────────────────
  useEffect(() => {
    requireAuth();
    loadAll();
  }, []);

  // Handle closing expense modal and cleaning up camera
  useEffect(() => {
    if (!showExpenseModal) {
      stopCamera();
      setReceiptPreview(null);
      setReceiptFile(null);
    }
  }, [showExpenseModal]);

  async function loadAll() {
    try {
      setLoading(true);
      const [statsData, tripData] = await Promise.all([
        driverAPI.stats(),
        driverAPI.currentTrip(),
      ]);
      setStats(statsData);
      setTrip(tripData);

      // Seed GPS from DB if already stored
      if (tripData?.driver_lat && tripData?.driver_lng) {
        setDriverPos([tripData.driver_lat, tripData.driver_lng]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Geocode + Route ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!trip?.pickup_location || !trip?.drop_location) return;

    async function buildMap() {
      // Only geocode if we haven't already
      let pPos = pickupPos;
      let dPos = dropPos;
      
      if (!pPos || !dPos) {
        const [geoP, geoD] = await Promise.all([
          geocode(trip.pickup_location),
          geocode(trip.drop_location),
        ]);
        pPos = geoP;
        dPos = geoD;
        setPickupPos(geoP);
        setDropPos(geoD);
      }

      if (pPos && dPos) {
        // Fetch total trip distance (pickup -> drop) if we haven't yet
        if (!tripTotalDistance) {
          const totalRoute = await fetchRoutePoints([pPos, dPos]);
          setTripTotalDistance(totalRoute.distance);
        }

        if (routingPhase === "pickup") {
          // 2 segments: driver -> pickup, and pickup -> drop
          const [routeDriverToPickup, routePickupToDrop] = await Promise.all([
             fetchRoutePoints([driverPos, pPos]),
             fetchRoutePoints([pPos, dPos])
          ]);
          setPickupSegmentPoints(routeDriverToPickup.coords);
          setDropSegmentPoints(routePickupToDrop.coords);
        } else {
          // 1 segment: driver -> drop
          const routeDriverToDrop = await fetchRoutePoints([driverPos, dPos]);
          setPickupSegmentPoints([]); // No pickup segment
          setDropSegmentPoints(routeDriverToDrop.coords);
        }
      }
    }
    
    // We re-run this if routingPhase changes. 
    // We DO NOT put driverPos in dependencies to avoid fetching route every second.
    buildMap();
  }, [trip?.pickup_location, trip?.drop_location, routingPhase]);

  // ── GPS sharing (1 second interval) ────────────────────────────────────
  useEffect(() => {
    if (!trip?.id || trip?.status !== "On Trip") {
      stopGps();
      return;
    }
    startGps(trip.id);
    return () => stopGps();
  }, [trip?.id, trip?.status]);

  function startGps(tripId) {
    if (!navigator.geolocation) { setGpsStatus("unavailable"); return; }
    stopGps();
    gpsIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setDriverPos([lat, lng]);
          setGpsStatus("live");
          tripsAPI.updateLocation(tripId, { lat, lng }).catch(() => {});
        },
        (err) => {
          if (err.code === 1) { setGpsStatus("denied"); stopGps(); }
        },
        { enableHighAccuracy: true, timeout: 2000, maximumAge: 0 }
      );
    }, 1000);
  }

  function stopGps() {
    if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    setGpsStatus("idle");
  }

  // ── WebSocket (receive admin-pushed location updates, future use) ────────
  useEffect(() => {
    if (!trip?.id) return;
    const ws = new WebSocket(`${WS_BASE_URL}/trips/${trip.id}/location/ws`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const { lat, lng } = JSON.parse(e.data);
        setDriverPos([lat, lng]);
      } catch {}
    };
    return () => ws.close();
  }, [trip?.id]);

  // ── Camera ───────────────────────────────────────────────────────────────
  async function startCamera() {
    setShowCamera(true);
    setReceiptPreview(null);
    setReceiptFile(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("Could not access camera: " + err.message);
      setShowCamera(false);
    }
  }

  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to file
    canvas.toBlob((blob) => {
      const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
      stopCamera();
    }, "image/jpeg", 0.8);
  }

  // ── Status update ────────────────────────────────────────────────────────
  async function handleStatusUpdate(newStatus, distanceTravelledKm = null) {
    try {
      setStatusUpdating(true);
      const payload = { trip_status: newStatus };
      if (distanceTravelledKm !== null) {
        payload.distance_travelled_km = distanceTravelledKm;
      }
      await driverAPI.updateTripStatus(payload);
      await loadAll(); // reload to reflect new status
    } catch (err) {
      alert("Failed to update status: " + err.message);
    } finally {
      setStatusUpdating(false);
    }
  }

  // ── Auto-Complete Trip ───────────────────────────────────────────────────
  useEffect(() => {
    if (trip?.status === "On Trip" && driverPos && dropPos && !statusUpdating) {
      const dist = haversineDistance(driverPos, dropPos);
      if (dist < 200) {
        // We are within 200m of the destination. Auto-complete!
        handleStatusUpdate("Completed", tripTotalDistance / 1000);
      }
    }
  }, [driverPos, dropPos, trip?.status, tripTotalDistance, statusUpdating]);

  // ── Expenses ─────────────────────────────────────────────────────────────
  const handleToggleRecord = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setAudioBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
          stream.getTracks().forEach(track => track.stop());
        };

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognitionRef.current = recognition;
          recognition.lang = "en-IN";
          recognition.interimResults = false;
          recognition.continuous = false;

          recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setExpenseForm(prev => ({
              ...prev,
              notes: prev.notes ? prev.notes + " " + transcript : transcript
            }));
          };

          recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
          };

          recognition.start();
        }

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        alert("Microphone access denied or error occurred: " + err.message);
      }
    }
  };

  async function handleAddExpense(e) {
    e.preventDefault();
    if (!trip?.id || !expenseForm.amount) return;
    if (!receiptFile) {
      alert("Please upload a receipt/bill image.");
      return;
    }
    try {
      setSavingExpense(true);

      let receipt_url = null;
      if (receiptFile) {
        const uploadRes = await uploadAPI.uploadFile(receiptFile);
        receipt_url = uploadRes.url;
        
        // AI Receipt Verification
        try {
          const verifyRes = await expensesAPI.verifyReceipt({
            amount: parseFloat(expenseForm.amount),
            receipt_url
          });
          
          if (verifyRes.extracted_amount !== null && !verifyRes.match) {
            const proceed = window.confirm(
              `Warning: The amount extracted by our AI from the receipt (₹${verifyRes.extracted_amount}) ` +
              `does not match your entered amount (₹${expenseForm.amount}).\n\nDo you still want to proceed?`
            );
            if (!proceed) {
              setSavingExpense(false);
              return;
            }
          }
        } catch (verifyErr) {
          console.error("Receipt verification failed:", verifyErr);
          // Proceed with expense creation even if verification fails
        }
      }

      let audio_note_url = null;
      if (audioBlob) {
        const audioFile = new File([audioBlob], 'audio_note.webm', { type: 'audio/webm' });
        const audioUploadRes = await uploadAPI.uploadFile(audioFile);
        audio_note_url = audioUploadRes.url;
      }

      await expensesAPI.create({
        vehicle_id: trip.vehicle_id || "", 
        trip_id: trip.id,
        category: expenseForm.category,
        amount: parseFloat(expenseForm.amount),
        notes: expenseForm.notes,
        audio_note_url,
        receipt_url,
        location_lat: driverPos ? driverPos[0] : null,
        location_lng: driverPos ? driverPos[1] : null,
      });
      setShowExpenseModal(false);
      setExpenseForm({ category: "Fuel", amount: "", notes: "" });
      setReceiptFile(null);
      setAudioBlob(null);
      setAudioUrl(null);
      alert("Expense logged successfully!");
    } catch (err) {
      alert("Failed to log expense: " + err.message);
    } finally {
      setSavingExpense(false);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  const hasActiveTrip = trip && trip.status !== "No Active Trip" && trip.id;
  const mapPoints = [pickupPos, dropPos, driverPos].filter(Boolean);
  const mapCenter = pickupPos || [20.5937, 78.9629]; // India center fallback

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="drv-layout">

      {/* ── Sidebar ── */}
      {/* <div className="drv-sidebar">
        <div className="drv-sidebar-brand">
          <span className="drv-brand-icon">🚗</span>
          <span>Driver Panel</span>
        </div>
        <nav className="drv-nav">
          <div className="drv-nav-item active">📊 Dashboard</div>
          <div className="drv-nav-item">📋 My Trips</div>
          <div className="drv-nav-item">🚗 My Vehicle</div>
          <div className="drv-nav-item">📄 Documents</div>
          <div className="drv-nav-item">⚙ Settings</div>
        </nav>
        <div
          className="drv-logout"
          onClick={() => window.confirm("Log out?") && logout()}
        >
          🚪 Logout
        </div>
      </div> */}

      <DriverSidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
      
      <div
         className={`drv-main ${
         sidebarOpen ? "sidebar-open" : "sidebar-closed"
        }`}
      >
        {/* Topbar */}
        {/* <div className="drv-topbar">
          <div>
            <h1>Driver Dashboard</h1>
            <p>Your active trip and live route map</p>
          </div>
          <div className="drv-topbar-right">
            {gpsStatus === "live" && (
              <span className="drv-gps-badge live">
                <span className="drv-gps-dot" /> Sharing GPS Live
              </span>
            )}
            {gpsStatus === "denied" && (
              <span className="drv-gps-badge denied">⚠ GPS Denied</span>
            )}
            <div className="drv-avatar">D</div>
          </div>
        </div> */}
        
        <DriverNavbar
          toggleSidebar={() =>
         setSidebarOpen(!sidebarOpen)
         }
        />
        {error && <div className="drv-error">⚠ {error}</div>}

        {/* ── Stat Cards ── */}
        <div className="drv-cards">
          <div className="drv-card greeen">
            <div className="drv-card-icon">📋</div>
            <div>
              <div className="drv-card-label">Active Trips</div>
              <div className="drv-card-value">{loading ? "—" : stats?.assigned_trips ?? 0}</div>
            </div>
          </div>
          <div className="drv-card bluee">
            <div className="drv-card-icon">✅</div>
            <div>
              <div className="drv-card-label">Completed</div>
              <div className="drv-card-value">{loading ? "—" : stats?.completed_trips ?? 0}</div>
            </div>
          </div>
          <div className="drv-card purplee">
            <div className="drv-card-icon">🚗</div>
            <div>
              <div className="drv-card-label">Vehicle Status</div>
              <div className="drv-card-value" style={{ fontSize: "16px" }}>
                {loading ? "—" : stats?.vehicle_status ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Current Trip Info ── */}
        {!loading && (
          hasActiveTrip ? (
            <div className="drv-trip-grid">

              {/* Left: Trip details */}
              <div className="drv-trip-card">
                <div className="drv-trip-header">
                  <h2>Current Trip</h2>
                  <span className={`drv-status-badge ${
                    trip.status === "On Trip"   ? "on-trip"   :
                    trip.status === "Scheduled" ? "scheduled" : ""
                  }`}>
                    {trip.status}
                  </span>
                </div>

                {/* Route visual */}
                <div className="drv-route-visual">
                  <div className="drv-route-point pickup">
                    <span className="drv-route-dot green" />
                    <div>
                      <div className="drv-route-label">Pickup</div>
                      <div className="drv-route-value">{trip.pickup_location}</div>
                    </div>
                  </div>
                  <div className="drv-route-line" />
                  <div className="drv-route-point drop">
                    <span className="drv-route-dot red" />
                    <div>
                      <div className="drv-route-label">Drop</div>
                      <div className="drv-route-value">{trip.drop_location}</div>
                    </div>
                  </div>
                </div>

                {/* Trip details */}
                <div className="drv-detail-grid">
                  <div className="drv-detail-item">
                    <div className="drv-detail-label">Trip ID</div>
                    <div className="drv-detail-value blue">{trip.trip_id}</div>
                  </div>
                  <div className="drv-detail-item">
                    <div className="drv-detail-label">Vehicle</div>
                    <div className="drv-detail-value">{trip.vehicle} <span className="drv-chip">{trip.vehicle_type}</span></div>
                  </div>
                  <div className="drv-detail-item">
                    <div className="drv-detail-label">Client</div>
                    <div className="drv-detail-value">{trip.client_name}</div>
                  </div>
                  <div className="drv-detail-item">
                    <div className="drv-detail-label">Reporting Time</div>
                    <div className="drv-detail-value">
                      {trip.reporting_time ? new Date(trip.reporting_time).toLocaleString() : "—"}
                    </div>
                  </div>
                  {trip.notes && (
                    <div className="drv-detail-item" style={{ gridColumn: "1 / -1" }}>
                      <div className="drv-detail-label">Notes</div>
                      <div className="drv-detail-value">{trip.notes}</div>
                    </div>
                  )}
                </div>

                {/* Status action buttons */}
                <div className="drv-action-row">
                  {trip.status === "Scheduled" && (
                    <button
                      className="drv-btn start"
                      onClick={() => handleStatusUpdate("On Trip")}
                      disabled={statusUpdating}
                    >
                      {statusUpdating ? "Updating…" : "🚀 Start Trip"}
                    </button>
                  )}
                  {trip.status === "On Trip" && (
                    <>
                      <div className="drv-gps-hint" style={{ color: "#3b82f6", background: "#eff6ff", margin: "0 0 10px 0" }}>
                        📍 Trip will auto-complete when you arrive at the drop location.
                      </div>
                      <button
                        className="drv-btn cancel"
                        onClick={() => handleStatusUpdate("Cancelled")}
                        disabled={statusUpdating}
                      >
                        Cancel Trip
                      </button>
                    </>
                  )}
                </div>

                {/* Freight Docs Section (Trucks Only) */}
                {["truck", "container", "flatbed", "refrigerated", "heavy-duty", "heavy", "lorry"].some(k => (trip?.vehicle_type || "").toLowerCase().includes(k)) && (
                  <div className="drv-docs-section" style={{ marginTop: "16px", padding: "16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                    <h3 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>📄 Trip Documents</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>E-Way Bill</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", fontFamily: "monospace" }}>{trip.eway_bill || "NOT PROVIDED"}</div>
                      
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700, marginTop: "8px" }}>GR / LR Number</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", fontFamily: "monospace" }}>{trip.gr_number || "NOT PROVIDED"}</div>
                    </div>
                    <button 
                      onClick={() => setShowDocsModal(true)}
                      style={{ width: "100%", padding: "12px", background: "#334155", color: "white", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}
                    >
                      👮 Show to Officer
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Live Map */}
              <div className="drv-map-card">
                <div className="drv-map-header">
                  <h2>🗺 Live Route Map</h2>
                  <div className="drv-map-legend">
                    <span><span style={{ color: "#10b981" }}>●</span> Pickup</span>
                    <span><span style={{ color: "#ef4444" }}>●</span> Drop</span>
                    {driverPos && <span><span style={{ color: "#3b82f6" }}>●</span> You</span>}
                  </div>
                </div>

                <div className="drv-map-actions" style={{ marginBottom: 12, display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <div className="drv-phase-toggle" style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 4 }}>
                    <button 
                      style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: routingPhase === "pickup" ? "white" : "transparent", boxShadow: routingPhase === "pickup" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", fontWeight: 600, color: routingPhase === "pickup" ? "#0f172a" : "#64748b", cursor: "pointer", fontSize: 13 }}
                      onClick={() => setRoutingPhase("pickup")}
                    >
                      Heading to Pickup
                    </button>
                    <button 
                      style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: routingPhase === "drop" ? "white" : "transparent", boxShadow: routingPhase === "drop" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", fontWeight: 600, color: routingPhase === "drop" ? "#0f172a" : "#64748b", cursor: "pointer", fontSize: 13 }}
                      onClick={() => setRoutingPhase("drop")}
                    >
                      Heading to Drop
                    </button>
                  </div>
                  <button 
                    style={{ padding: "6px 14px", border: "none", borderRadius: 8, background: "#f59e0b", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                    onClick={() => setShowExpenseModal(true)}
                  >
                    + Log Expense
                  </button>
                </div>

                <div className="drv-map-wrap">
                  <MapContainer
                    center={mapCenter}
                    zoom={6}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Route polyline (Driver to Pickup) */}
                    {pickupSegmentPoints.length > 0 && (
                      <Polyline
                        positions={pickupSegmentPoints}
                        color="#f59e0b" // orange/amber
                        weight={4}
                        opacity={0.8}
                        dashArray="8, 4"
                      />
                    )}

                    {/* Route polyline (Pickup to Drop or Driver to Drop) */}
                    {dropSegmentPoints.length > 0 && (
                      <Polyline
                        positions={dropSegmentPoints}
                        color="#3b82f6"
                        weight={4}
                        opacity={0.8}
                        dashArray="8, 4"
                      />
                    )}

                    {/* Pickup marker */}
                    {pickupPos && (
                      <Marker position={pickupPos} icon={pickupIcon}>
                        <Popup>
                          <strong>📦 Pickup Point</strong><br />{trip.pickup_location}
                        </Popup>
                      </Marker>
                    )}

                    {/* Drop marker */}
                    {dropPos && (
                      <Marker position={dropPos} icon={dropIcon}>
                        <Popup>
                          <strong>🏁 Drop Point</strong><br />{trip.drop_location}
                        </Popup>
                      </Marker>
                    )}

                    {/* Driver live position */}
                    {driverPos && (
                      <Marker position={driverPos} icon={driverIcon}>
                        <Popup>
                          <strong>🚗 Your Location</strong><br />
                          Lat: {driverPos[0].toFixed(5)}<br />
                          Lng: {driverPos[1].toFixed(5)}
                        </Popup>
                      </Marker>
                    )}

                    <FitBounds 
                      points={mapPoints} 
                      routingPhase={routingPhase} 
                      hasDriverPos={!!driverPos} 
                    />
                  </MapContainer>

                  {/* Waiting overlay if no geocoded points yet */}
                  {mapPoints.length === 0 && (
                    <div className="drv-map-overlay">
                      <div className="drv-map-spinner" />
                      <p>Loading map…</p>
                    </div>
                  )}
                </div>

                {trip.status === "On Trip" && gpsStatus !== "live" && (
                  <div className="drv-gps-hint">
                    ⚠ Enable location permission in your browser to share live GPS
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* No active trip */
            <div className="drv-no-trip">
              <div className="drv-no-trip-icon">🚦</div>
              <h2>No Active Trip</h2>
              <p>You have no scheduled or active trips right now.<br />Your admin will assign you a trip soon.</p>
            </div>
          )
        )}

        {loading && (
          <div className="drv-loading">
            <div className="drv-map-spinner" />
            <p>Loading your dashboard…</p>
          </div>
        )}

        {/* Docs Modal */}
        {showDocsModal && (
          <div className="modal-overlay" style={{ background: "rgba(0,0,0,0.9)", zIndex: 9999 }}>
            <div className="modal-content" style={{ maxWidth: "100%", width: "100vw", height: "100vh", borderRadius: 0, padding: "24px", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }}>
              <button 
                onClick={() => setShowDocsModal(false)}
                style={{ position: "absolute", top: "24px", right: "24px", background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
              
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ fontSize: "16px", color: "#64748b", fontWeight: 600, marginBottom: "8px" }}>Trip ID</div>
                <div style={{ fontSize: "24px", fontWeight: 800 }}>{trip?.trip_id}</div>
                <div style={{ fontSize: "16px", color: "#64748b", fontWeight: 600, marginTop: "16px", marginBottom: "8px" }}>Vehicle</div>
                <div style={{ fontSize: "28px", fontWeight: 800, color: "#3b82f6" }}>{trip?.vehicle}</div>
              </div>

              <div style={{ background: "#f8fafc", padding: "24px", borderRadius: "16px", border: "2px solid #e2e8f0", marginBottom: "24px", textAlign: "center" }}>
                <div style={{ fontSize: "18px", color: "#64748b", textTransform: "uppercase", fontWeight: 800, marginBottom: "12px", letterSpacing: "1px" }}>E-Way Bill</div>
                <div style={{ fontSize: "36px", fontWeight: 900, color: "#0f172a", fontFamily: "monospace", wordBreak: "break-all" }}>
                  {trip?.eway_bill || "N/A"}
                </div>
                {trip?.eway_bill && (
                  <button 
                    onClick={() => { navigator.clipboard.writeText(trip.eway_bill); alert("Copied!"); }}
                    style={{ marginTop: "16px", padding: "8px 16px", background: "#e2e8f0", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", color: "#334155" }}
                  >
                    📋 Copy
                  </button>
                )}
              </div>

              <div style={{ background: "#f8fafc", padding: "24px", borderRadius: "16px", border: "2px solid #e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: "18px", color: "#64748b", textTransform: "uppercase", fontWeight: 800, marginBottom: "12px", letterSpacing: "1px" }}>GR / LR Number</div>
                <div style={{ fontSize: "36px", fontWeight: 900, color: "#0f172a", fontFamily: "monospace", wordBreak: "break-all" }}>
                  {trip?.gr_number || "N/A"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Expense Modal */}
        {showExpenseModal && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 400 }}>
              <div className="modal-header">
                <h2>Log Expense</h2>
                <button className="close-btn" onClick={() => setShowExpenseModal(false)}>×</button>
              </div>
              <form onSubmit={handleAddExpense} className="modal-body">
                <div className="form-group">
                  <label>Category</label>
                  <select 
                    value={expenseForm.category} 
                    onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}
                    required
                  >
                    <option value="Fuel">Fuel (Diesel/Petrol)</option>
                    <option value="Tolls">Tolls & Border Tax</option>
                    <option value="Parking">Parking Fees</option>
                    <option value="Service & Repair">Service & Repair</option>
                    <option value="Miscellaneous">Miscellaneous (Loading, Canteen, etc.)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount (₹)</label>
                  <input 
                    type="number" 
                    value={expenseForm.amount} 
                    onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} 
                    placeholder="e.g. 1500"
                    required
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input 
                      type="text" 
                      value={expenseForm.notes} 
                      onChange={e => setExpenseForm({...expenseForm, notes: e.target.value})} 
                      placeholder="e.g. Filled 20L diesel at BPCL"
                      style={{ flex: 1 }}
                    />
                    <button 
                      type="button" 
                      onClick={handleToggleRecord}
                      className="btn-secondary"
                      style={{ 
                        padding: "10px 15px", 
                        backgroundColor: isRecording ? "#fee2e2" : "#f1f5f9",
                        color: isRecording ? "#ef4444" : "#475569",
                        borderColor: isRecording ? "#ef4444" : "#cbd5e1",
                        whiteSpace: "nowrap"
                      }}
                      title="Record Voice Note"
                    >
                      {isRecording ? "🔴 Stop Recording" : "🎤 Record"}
                    </button>
                  </div>
                  {audioUrl && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: "10px" }}>
                      <audio src={audioUrl} controls style={{ height: "36px", flex: 1 }} />
                      <button 
                        type="button" 
                        onClick={() => { setAudioUrl(null); setAudioBlob(null); }}
                        style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer", fontSize: "12px" }}
                        title="Delete Audio"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Receipt Photo</label>
                  
                  {!showCamera && !receiptPreview && (
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button type="button" className="btn-secondary" onClick={startCamera} style={{ flex: 1, padding: "12px 10px", fontSize: "14px" }}>
                        📷 Open Camera
                      </button>
                      <div style={{ flex: 1, position: "relative" }}>
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={e => {
                            if(e.target.files[0]) {
                              setReceiptFile(e.target.files[0]);
                              setReceiptPreview(URL.createObjectURL(e.target.files[0]));
                            }
                          }}
                          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                        />
                        <button type="button" className="btn-secondary" style={{ width: "100%", padding: "12px 10px", fontSize: "14px", pointerEvents: "none" }}>
                          📁 Upload File
                        </button>
                      </div>
                    </div>
                  )}

                  {showCamera && (
                    <div style={{ marginTop: 10, background: "#000", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                      <video ref={videoRef} autoPlay playsInline style={{ width: "100%", maxHeight: "300px", display: "block" }} />
                      <canvas ref={canvasRef} style={{ display: "none" }} />
                      <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10 }}>
                        <button type="button" className="btn-secondary" onClick={stopCamera}>Cancel</button>
                        <button type="button" className="btn-primary" onClick={capturePhoto}>📸 Capture</button>
                      </div>
                    </div>
                  )}

                  {receiptPreview && !showCamera && (
                    <div style={{ marginTop: 10, position: "relative" }}>
                      <img src={receiptPreview} alt="Receipt Preview" style={{ width: "100%", maxHeight: "200px", objectFit: "contain", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                      <button 
                        type="button" 
                        onClick={() => { setReceiptPreview(null); setReceiptFile(null); }}
                        style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {driverPos ? <small style={{ color: "#10b981", marginTop: 8, display: "block", fontWeight: "600" }}>📍 Geotag will be attached automatically</small> : <small style={{ color: "#ef4444", marginTop: 8, display: "block", fontWeight: "600" }}>⚠ Waiting for GPS location</small>}
                </div>
                <div className="modal-actions" style={{ marginTop: 20 }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowExpenseModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingExpense}>
                    {savingExpense ? "Saving..." : "Save Expense"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default DriverDashboard;