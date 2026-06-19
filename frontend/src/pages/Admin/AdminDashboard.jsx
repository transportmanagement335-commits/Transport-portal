import { useEffect, useState } from "react";
import { FaTruck, FaUserTie, FaRoute, FaFileAlt } from "react-icons/fa";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { adminAPI, requireAuth } from "../../api";

import "../../styles/Admin/AdminDashboard.css";

function AdminDashboard() {

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [stats, setStats] = useState({
    total_vehicles: 0,
    active_drivers: 0,
    trips_today: 0,
    pending_documents: 0,
    available_vehicles: 0,
    booked_vehicles: 0,
    maintenance_vehicles: 0,
    type_distribution: {},
    document_expiry_alerts: [],
    payments: { pending_amount: 0, overdue_amount: 0, pending_count: 0, overdue_count: 0 },
    upcoming_duties: [],
    total_profit: 0,
  });

  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    requireAuth();
    async function load() {
      try {
        const [statsData, activityData] = await Promise.all([
          adminAPI.stats(),
          adminAPI.recentActivity(),
        ]);
        setStats(statsData);
        setActivity(activityData.activities || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="dashboard-layout">

      {/* SIDEBAR */}
      <Sidebar sidebarOpen={sidebarOpen} />

      {/* MAIN CONTENT */}
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>

        {/* TOPBAR */}
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* ERROR */}
        {error && (
          <div style={{ background: "#fee2e2", color: "#ef4444", padding: "12px 16px", borderRadius: "10px", marginBottom: "20px", fontSize: "14px" }}>
            ⚠ {error}
          </div>
        )}

        {/* DASHBOARD CARDS */}
        {/* DASHBOARD CARDS */}
<div className="cards">

  <div className="card">
    <h3>Total Vehicles</h3>
    <p>{loading ? "—" : stats.total_vehicles}</p>

    <div className="dashboard-icon vehicles">
      <FaTruck />
    </div>
  </div>

  <div className="card">
    <h3>Active Drivers</h3>
    <p>{loading ? "—" : stats.active_drivers}</p>

    <div className="dashboard-icon drivers">
      <FaUserTie />
    </div>
  </div>

  <div className="card">
    <h3>Trips Today</h3>
    <p>{loading ? "—" : stats.trips_today}</p>

    <div className="dashboard-icon trips">
      <FaRoute />
    </div>
  </div>

  <div className="card">
    <h3>Pending Documents</h3>
    <p>{loading ? "—" : stats.pending_documents}</p>

    <div className="dashboard-icon docs">
      <FaFileAlt />
    </div>
  </div>

  <div className="card purple">
    <h3>Total Profit</h3>
    <p>{loading ? "—" : `₹${stats.total_profit?.toLocaleString() || 0}`}</p>
  </div>

</div>

        {/* ROW 2: LIVE STATUS & TYPES + PAYMENTS */}
        <div className="dashboard-grid-row">
          
          <div className="dashboard-grid-col-2">
            <div className="dashboard-split-box">
              
              {/* LIVE VEHICLE STATUS */}
              <div className="dashboard-widget-panel">
                <h2>Live Vehicle Status</h2>
                <div className="status-bars">
                  
                  <div className="status-bar-item">
                    <div className="status-bar-label">
                      <span>Available Vehicles</span>
                      <span className="count-label green-txt">{loading ? "—" : stats.available_vehicles}</span>
                    </div>
                    <div className="status-bar-bg">
                      <div className="status-bar-fill green-bg" style={{ width: `${stats.total_vehicles ? (stats.available_vehicles / stats.total_vehicles) * 100 : 0}%` }}></div>
                    </div>
                  </div>

                  <div className="status-bar-item">
                    <div className="status-bar-label">
                      <span>Booked Vehicles</span>
                      <span className="count-label blue-txt">{loading ? "—" : stats.booked_vehicles}</span>
                    </div>
                    <div className="status-bar-bg">
                      <div className="status-bar-fill blue-bg" style={{ width: `${stats.total_vehicles ? (stats.booked_vehicles / stats.total_vehicles) * 100 : 0}%` }}></div>
                    </div>
                  </div>

                  <div className="status-bar-item">
                    <div className="status-bar-label">
                      <span>In Repair & Maintenance</span>
                      <span className="count-label orange-txt">{loading ? "—" : stats.maintenance_vehicles}</span>
                    </div>
                    <div className="status-bar-bg">
                      <div className="status-bar-fill orange-bg" style={{ width: `${stats.total_vehicles ? (stats.maintenance_vehicles / stats.total_vehicles) * 100 : 0}%` }}></div>
                    </div>
                  </div>

                </div>
              </div>

              {/* VEHICLE TYPE VIEW */}
              <div className="dashboard-widget-panel">
                <h2>Live Fleet Overview</h2>
                {loading ? (
                  <p className="no-data-msg">Loading distribution...</p>
                ) : Object.keys(stats.type_distribution || {}).length === 0 ? (
                  <p className="no-data-msg">No vehicle types registered.</p>
                ) : (
                  <div>
                    {/* Stacked Bar */}
                    <div style={{ display: 'flex', height: '24px', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                      {Object.entries(stats.type_distribution).map(([type, count]) => {
                        const total = Object.values(stats.type_distribution).reduce((a, b) => a + b, 0);
                        const bluePalette = ["#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];
                        const amberPalette = ["#78350f", "#b45309", "#d97706", "#f59e0b", "#fbbf24", "#fcd34d"];
                        let hash = 0; for (let i = 0; i < type.length; i++) hash += type.charCodeAt(i);
                        const color = type.startsWith("Bus") ? bluePalette[hash % bluePalette.length] : 
                                      type.startsWith("Truck") ? amberPalette[hash % amberPalette.length] : "#64748b";
                        return (
                          <div 
                            key={type} 
                            style={{ 
                              width: `${(count/total)*100}%`, 
                              backgroundColor: color,
                              borderRight: '1px solid #fff'
                            }} 
                            title={`${type}: ${count}`}
                          />
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      {Object.entries(stats.type_distribution).map(([type, count]) => {
                        const bluePalette = ["#1e3a8a", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];
                        const amberPalette = ["#78350f", "#b45309", "#d97706", "#f59e0b", "#fbbf24", "#fcd34d"];
                        let hash = 0; for (let i = 0; i < type.length; i++) hash += type.charCodeAt(i);
                        const color = type.startsWith("Bus") ? bluePalette[hash % bluePalette.length] : 
                                      type.startsWith("Truck") ? amberPalette[hash % amberPalette.length] : "#64748b";
                        return (
                          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: color }} />
                            <span><strong>{type}</strong> ({count})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="dashboard-grid-col-1">
            {/* PAYMENTS OVERVIEW */}
            <div className="dashboard-widget-panel payment-widget">
              <h2>Billing & Payments</h2>
              <div className="payment-cards-grid">
                
                <div className="payment-card pending-gradient">
                  <span className="payment-icon">💳</span>
                  <div className="payment-details">
                    <h3>Pending Balance</h3>
                    <p className="amount">
                      {loading ? "₹—" : `₹${stats.payments?.pending_amount?.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    </p>
                    <span className="count-tag">{loading ? "—" : stats.payments?.pending_count} Pending Trips</span>
                  </div>
                </div>

                <div className="payment-card overdue-gradient">
                  <span className="payment-icon">🚨</span>
                  <div className="payment-details">
                    <h3>Overdue Balance</h3>
                    <p className="amount">
                      {loading ? "₹—" : `₹${stats.payments?.overdue_amount?.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    </p>
                    <span className="count-tag danger-tag">{loading ? "—" : stats.payments?.overdue_count} Overdue Trips</span>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>

        {/* ROW 3: EXPIRY ALERTS + UPCOMING DUTIES */}
        <div className="dashboard-grid-row">

          <div className="dashboard-grid-col-1">
            {/* DOCUMENT EXPIRY ALERTS */}
            <div className="dashboard-widget-panel scrollable-panel">
              <h2>Document Expiry Alerts</h2>
              {loading ? (
                <p className="no-data-msg">Checking document status...</p>
              ) : stats.document_expiry_alerts?.length === 0 ? (
                <p className="no-data-msg text-success">✓ All vehicle certificates are valid!</p>
              ) : (
                <div className="alert-list">
                  {stats.document_expiry_alerts.map((alert, idx) => (
                    <div className={`alert-item-card ${alert.status === 'Expired' ? 'expired-border' : 'expiring-border'}`} key={idx}>
                      <div className="alert-item-header">
                        <span className="alert-vehicle">{alert.vehicle_number}</span>
                        <span className={`status-badge-alert ${alert.status === 'Expired' ? 'expired-badge' : 'expiring-badge'}`}>
                          {alert.status}
                        </span>
                      </div>
                      <div className="alert-item-body">
                        <p><strong>{alert.doc_type} Certificate</strong> expires on <strong>{alert.expiry_date}</strong></p>
                        <span className={`time-left-tag ${alert.status === 'Expired' ? 'expired-text' : 'expiring-text'}`}>
                          ⚠️ {alert.days_left < 0 ? `${Math.abs(alert.days_left)} days overdue` : `${alert.days_left} days remaining`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-grid-col-1">
            {/* UPCOMING DUTIES */}
            <div className="dashboard-widget-panel scrollable-panel">
              <h2>Upcoming Driver Duties</h2>
              {loading ? (
                <p className="no-data-msg">Loading upcoming duties...</p>
              ) : stats.upcoming_duties?.length === 0 ? (
                <p className="no-data-msg">No driver duties assigned. Assign vehicles to active drivers.</p>
              ) : (
                <div className="duty-list">
                  {stats.upcoming_duties.map((duty, idx) => (
                    <div className="duty-item-card" key={idx}>
                      <div className="duty-avatar">
                        {duty.driver_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="duty-info">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4>{duty.driver_name}</h4>
                          <span className={`status-badge ${duty.status === 'On Trip' ? 'booked' : duty.status === 'Ready' ? 'active' : 'maintenance'}`}>
                            {duty.status}
                          </span>
                        </div>
                        <p className="duty-vehicle">Vehicle: <strong>{duty.vehicle_number}</strong></p>
                        <p className="duty-route">📍 {duty.route}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* RECENT ACTIVITY TABLE */}
        <div className="table-section" style={{ marginTop: "28px" }}>

          <h2>Recent Vehicle Activity</h2>

          {loading ? (
            <p style={{ color: "#64748b", fontSize: "14px" }}>Loading activity...</p>
          ) : activity.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "14px" }}>No recent activity. Add vehicles to get started.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row, i) => (
                  <tr key={i}>
                    <td>{row.vehicle}</td>
                    <td>{row.driver}</td>
                    <td>
                      <span className={`status-badge ${row.status?.toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{row.location || "—"}</td>
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

export default AdminDashboard;