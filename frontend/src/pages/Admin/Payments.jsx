import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { tripsAPI, adminAPI, paymentsAPI, requireAuth } from "../../api";
import "../../styles/Admin/Payments.css";

import {
  FiDollarSign,
  FiAlertTriangle,
  FiDownload,
  FiChevronDown,
  FiChevronRight,
  FiX,
  FiPlus,
} from "react-icons/fi";

const Payments = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Data State
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalProfit, setTotalProfit] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All Status");

  // Expand/Collapse Client Rows
  const [expandedClients, setExpandedClients] = useState({});

  // "Log Payment" modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTrip, setPayTrip] = useState(null);       // trip object selected
  const [amountReceived, setAmountReceived] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    requireAuth();
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError("");
      const [tripsData, statsData] = await Promise.all([
        tripsAPI.list(),
        adminAPI.stats()
      ]);
      setTrips(tripsData);
      setTotalProfit(statsData.total_profit || 0);
    } catch (err) {
      setError("Failed to load data: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const toggleClient = (clientKey) => {
    setExpandedClients((prev) => ({
      ...prev,
      [clientKey]: !prev[clientKey],
    }));
  };

  // Group Trips by Client using actual DB field: balance_amount
  const clientGroups = useMemo(() => {
    const groups = {};
    trips.forEach((trip) => {
      const clientKey = `${trip.client_name}__${trip.client_phone}`;

      const matchesSearch =
        trip.client_name?.toLowerCase().includes(search.toLowerCase()) ||
        trip.client_phone?.toLowerCase().includes(search.toLowerCase()) ||
        trip.trip_id?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        selectedStatus === "All Status"
          ? true
          : trip.payment_status === selectedStatus;

      if (matchesSearch && matchesStatus) {
        if (!groups[clientKey]) {
          groups[clientKey] = {
            client_name: trip.client_name,
            client_phone: trip.client_phone,
            total_balance: 0,
            trips: [],
          };
        }
        groups[clientKey].trips.push(trip);
        groups[clientKey].total_balance += trip.balance_amount || 0;
      }
    });
    return groups;
  }, [trips, search, selectedStatus]);

  // KPI Totals — all based on balance_amount (single financial field in DB)
  const totalBalance = trips.reduce((s, t) => s + (t.balance_amount || 0), 0);
  const tripsWithBalance = trips.filter((t) => (t.balance_amount || 0) > 0).length;
  const tripsSettled = trips.filter(
    (t) => t.payment_status === "Paid" || (t.balance_amount || 0) === 0
  ).length;

  // Open modal pre-filled with the selected trip
  const openPayModal = (e, trip) => {
    e.stopPropagation();
    setPayTrip(trip);
    setAmountReceived("");
    setPayMethod("Cash");
    setShowPayModal(true);
  };

  const handleLogPayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(amountReceived);
    if (!amount || amount <= 0) return alert("Please enter a valid amount.");

    try {
      setSaving(true);

      // Save to payments collection using paymentsAPI
      await paymentsAPI.create({
        trip_id: payTrip.id,
        amount_paid: amount,
        method: payMethod,
      });

      const newBalance = Math.max(0, (payTrip.balance_amount || 0) - amount);
      alert(`Payment of ₹${amount.toLocaleString()} logged! New balance: ₹${newBalance.toLocaleString()}`);
      
      setShowPayModal(false);
      fetchData();
    } catch (err) {
      alert("Failed to log payment: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* ── Page Header ── */}
        <div className="payments-header-row">
          <div>
            <h2 className="payments-page-title">Client Ledger & Payments</h2>
            <div className="payments-breadcrumb">
              Dashboard <span>›</span> Payments
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: "0 32px 16px", color: "#ef4444", fontWeight: 600 }}>
            ⚠ {error}
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="payment-kpi-grid">
          <div className="payment-kpi-card orange-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Total Outstanding</p>
                <h3>₹{totalBalance.toLocaleString()}</h3>
              </div>
              <div className="payment-kpi-icon orange-icon">
                <FiDollarSign />
              </div>
            </div>
          </div>
          <div className="payment-kpi-card red-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Trips with Balance</p>
                <h3>{tripsWithBalance}</h3>
              </div>
              <div className="payment-kpi-icon red-icon">
                <FiAlertTriangle />
              </div>
            </div>
          </div>
          <div className="payment-kpi-card green-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Trips Settled</p>
                <h3>{tripsSettled}</h3>
              </div>
              <div className="payment-kpi-icon green-icon">
                <FiDownload />
              </div>
            </div>
          </div>
          <div className="payment-kpi-card purple-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Total Trips</p>
                <h3>{trips.length}</h3>
              </div>
              <div className="payment-kpi-icon purple-icon">
                <FiDollarSign />
              </div>
            </div>
          </div>
          <div className="payment-kpi-card profit-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Total Profit</p>
                <h3>₹{totalProfit.toLocaleString()}</h3>
              </div>
              <div className="payment-kpi-icon profit-icon">
                <FiDollarSign />
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div style={{ display: "flex", gap: "15px", padding: "0 32px 20px" }}>
          <input
            className="t-input"
            placeholder="Search by client name, phone, or trip ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            className="t-input"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ width: "200px" }}
          >
            <option value="All Status">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
          </select>
        </div>

        {/* ── Client Ledger Table ── */}
        <div
          className="payments-table-panel"
          style={{ margin: "0 32px 40px", background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left", fontSize: "12px", color: "#475569", textTransform: "uppercase" }}>
                <th style={{ padding: "14px 20px" }}>Client</th>
                <th style={{ padding: "14px 20px" }}>Trips</th>
                <th style={{ padding: "14px 20px" }}>Total Balance Due</th>
                <th style={{ padding: "14px 20px" }}>Status</th>
                <th style={{ padding: "14px 20px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                    Loading trips...
                  </td>
                </tr>
              ) : Object.keys(clientGroups).length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                    No payment records found.
                  </td>
                </tr>
              ) : (
                Object.entries(clientGroups).map(([clientKey, group]) => {
                  const isExpanded = expandedClients[clientKey];

                  return (
                    <React.Fragment key={clientKey}>
                      {/* Client Header Row */}
                      <tr
                        style={{ cursor: "pointer", background: isExpanded ? "#f8fafc" : "white", borderBottom: "1px solid #f1f5f9" }}
                        onClick={() => toggleClient(clientKey)}
                      >
                        <td style={{ padding: "16px 20px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ color: "#64748b" }}>
                            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                          </span>
                          <div>
                            <div>{group.client_name}</div>
                            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "normal" }}>
                              {group.client_phone}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "16px 20px" }}>{group.trips.length}</td>
                        <td style={{ padding: "16px 20px", fontWeight: "bold", color: group.total_balance > 0 ? "#ef4444" : "#10b981" }}>
                          ₹{group.total_balance.toLocaleString()}
                        </td>
                        <td style={{ padding: "16px 20px" }}>
                          <span className={`status-badge ${group.total_balance <= 0 ? "active" : "maintenance"}`}>
                            {group.total_balance <= 0 ? "Settled" : "Due"}
                          </span>
                        </td>
                        <td style={{ padding: "16px 20px" }}>—</td>
                      </tr>

                      {/* Expanded: individual trip rows */}
                      {isExpanded &&
                        group.trips.map((trip) => (
                          <tr
                            key={trip.id}
                            style={{ background: "#fafafa", borderBottom: "1px solid #f1f5f9" }}
                          >
                            <td style={{ padding: "12px 20px 12px 54px" }}>
                              <div style={{ fontWeight: "600", color: "#2563eb" }}>{trip.trip_id}</div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>
                                {trip.vehicle_number} · {new Date(trip.reporting_time).toLocaleDateString()}
                              </div>
                            </td>
                            <td style={{ padding: "12px 20px", fontSize: "13px", color: "#475569" }}>
                              {trip.pickup_location} → {trip.drop_location}
                            </td>
                            <td style={{ padding: "12px 20px", fontWeight: "600", color: (trip.balance_amount || 0) > 0 ? "#ef4444" : "#10b981" }}>
                              ₹{(trip.balance_amount || 0).toLocaleString()}
                            </td>
                            <td style={{ padding: "12px 20px" }}>
                              <span className={`status-badge ${trip.payment_status === "Paid" ? "active" : trip.payment_status === "Partial" ? "booked" : "maintenance"}`}>
                                {trip.payment_status || "Pending"}
                              </span>
                            </td>
                            <td style={{ padding: "12px 20px" }}>
                              {(trip.balance_amount || 0) > 0 && (
                                <button
                                  className="btn-primary btn-sm"
                                  onClick={(e) => openPayModal(e, trip)}
                                >
                                  <FiPlus style={{ marginRight: 4 }} /> Log Payment
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Log Payment Modal ── */}
        {showPayModal && payTrip && (
          <div className="payment-modal-overlay">
            <div className="payment-modal" style={{ maxWidth: "460px" }}>
              <div className="payment-modal-top">
                <h3>Log Payment</h3>
                <button onClick={() => setShowPayModal(false)}>
                  <FiX />
                </button>
              </div>

              <div style={{ padding: "10px 0 20px", color: "#475569", fontSize: "14px" }}>
                <strong>Trip:</strong> {payTrip.trip_id} — {payTrip.client_name}<br />
                <strong>Current Balance:</strong>{" "}
                <span style={{ color: "#ef4444", fontWeight: 700 }}>
                  ₹{(payTrip.balance_amount || 0).toLocaleString()}
                </span>
              </div>

              <form onSubmit={handleLogPayment} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label className="trips-label">
                  <span>Amount Received Now (₹) *</span>
                  <input
                    type="number"
                    className="t-input"
                    required
                    min="1"
                    max={payTrip.balance_amount || 999999}
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder={`Max: ₹${(payTrip.balance_amount || 0).toLocaleString()}`}
                  />
                </label>

                <label className="trips-label">
                  <span>Payment Method</span>
                  <select
                    className="t-input"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Bank Transfer</option>
                    <option>Cheque</option>
                  </select>
                </label>

                {amountReceived && (
                  <div style={{ padding: "12px 16px", background: "#f0fdf4", borderRadius: "8px", fontSize: "13px", color: "#166534" }}>
                    New balance after payment:{" "}
                    <strong>
                      ₹{Math.max(0, (payTrip.balance_amount || 0) - parseFloat(amountReceived || 0)).toLocaleString()}
                    </strong>
                    {parseFloat(amountReceived) >= (payTrip.balance_amount || 0) && (
                      <span style={{ marginLeft: 8, background: "#dcfce7", borderRadius: 4, padding: "2px 6px" }}>✓ Fully Settled</span>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="save-payment-btn"
                  style={{ width: "100%" }}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Payment"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Payments;