import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { invoicesAPI, tripsAPI, paymentsAPI, adminAPI, notificationsAPI, requireAuth } from "../../api";
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
  const [invoices, setInvoices] = useState([]);
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
  const [payItem, setPayItem] = useState(null);       // mixed item selected
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
      const [invoicesData, tripsData, statsData] = await Promise.all([
        invoicesAPI.list(),
        tripsAPI.list(),
        adminAPI.stats()
      ]);
      setInvoices(invoicesData);
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

  // Group Ledger Items by Client
  const clientGroups = useMemo(() => {
    const groups = {};

    const getGroup = (name, phone) => {
      const clientKey = `${name}__${phone}`;
      if (!groups[clientKey]) {
        groups[clientKey] = {
          client_name: name,
          client_phone: phone,
          total_value: 0,
          total_paid: 0,
          total_balance: 0,
          items: [],
        };
      }
      return groups[clientKey];
    };

    // 1. Process Invoices
    invoices.forEach((invoice) => {
      const name = invoice.recipient_details?.name || "Unknown Client";
      const phone = invoice.recipient_details?.phone || "N/A";

      const matchesSearch =
        name.toLowerCase().includes(search.toLowerCase()) ||
        phone.toLowerCase().includes(search.toLowerCase()) ||
        invoice.invoice_number?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        selectedStatus === "All Status"
          ? true
          : invoice.status === selectedStatus;

      if (matchesSearch && matchesStatus) {
        const group = getGroup(name, phone);
        const balance = Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0));
        
        group.items.push({
          type: "invoice",
          id: invoice.id,
          reference: invoice.invoice_number,
          date: invoice.issue_date,
          item_desc: invoice.trip_id ? `Trip: ${invoice.trip_id}` : "Multiple/No Trip",
          total: invoice.total_amount || 0,
          paid: invoice.paid_amount || 0,
          balance: balance,
          status: invoice.status || "Draft",
          original: invoice
        });

        group.total_value += (invoice.total_amount || 0);
        group.total_paid += (invoice.paid_amount || 0);
        group.total_balance += balance;
      }
    });

    // 2. Process Un-invoiced Trips
    trips.forEach((trip) => {
      if (trip.is_invoiced || trip.invoice_id) return;

      const name = trip.client_name || "Unknown Client";
      const phone = trip.client_phone || "N/A";

      const matchesSearch =
        name.toLowerCase().includes(search.toLowerCase()) ||
        phone.toLowerCase().includes(search.toLowerCase()) ||
        trip.trip_id?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        selectedStatus === "All Status"
          ? true
          : trip.payment_status === selectedStatus;

      if (matchesSearch && matchesStatus) {
        const group = getGroup(name, phone);
        const tripTotal = trip.trip_cost || trip.balance_amount || 0;
        const tripPaid = trip.amount_paid || 0;
        const balance = trip.balance_amount || 0;

        group.items.push({
          type: "trip",
          id: trip.id,
          reference: trip.trip_id || `Trip ${trip.id.substring(0,6)}`,
          date: trip.created_at || trip.reporting_time,
          item_desc: "Un-invoiced Trip",
          total: tripTotal,
          paid: tripPaid,
          balance: balance,
          status: trip.payment_status || "Pending",
          original: trip
        });

        group.total_value += tripTotal;
        group.total_paid += tripPaid;
        group.total_balance += balance;
      }
    });

    return groups;
  }, [invoices, trips, search, selectedStatus]);

  // KPI Totals
  const allItems = useMemo(() => {
    return Object.values(clientGroups).flatMap(g => g.items);
  }, [clientGroups]);

  const totalLedgerValue = allItems.reduce((s, i) => s + i.total, 0);
  const totalCollected = allItems.reduce((s, i) => s + i.paid, 0);
  const totalBalance = allItems.reduce((s, i) => s + i.balance, 0);
  const itemsSettled = allItems.filter(i => i.balance <= 0 || i.status === "Paid" || i.status === "Settled").length;

  // Open modal pre-filled with the selected item
  const openPayModal = (e, item) => {
    e.stopPropagation();
    setPayItem(item);
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

      if (payItem.type === "invoice") {
        await invoicesAPI.recordPayment(payItem.id, {
          amount: amount,
          method: payMethod,
        });
      } else {
        await paymentsAPI.create({
          trip_id: payItem.id,
          amount_paid: amount,
          method: payMethod,
        });
      }

      const currentBalance = payItem.balance;
      const newBalance = Math.max(0, currentBalance - amount);
      alert(`Payment of ₹${amount.toLocaleString()} logged! New balance: ₹${newBalance.toLocaleString()}`);
      
      setShowPayModal(false);
      fetchData();
    } catch (err) {
      alert("Failed to log payment: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Send a payment reminder via WhatsApp
  const [reminding, setReminding] = useState(null); // item id being reminded
  async function sendReminder(e, group, item) {
    e.stopPropagation();
    const phone = group.client_phone;
    const name = group.client_name;
    if (!phone || phone === "N/A") {
      alert("No phone number available for this client.");
      return;
    }
    setReminding(item.id);
    try {
      await notificationsAPI.sendWhatsAppMessage({
        phone,
        name,
        messageType: "invoice_reminder",
      });
      alert(`Payment reminder sent to ${name} (${phone}) via WhatsApp!`);
    } catch (err) {
      alert("Failed to send reminder: " + err.message);
    } finally {
      setReminding(null);
    }
  }

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
                <p className="payment-kpi-label">Total Ledger Value</p>
                <h3>₹{totalLedgerValue.toLocaleString()}</h3>
              </div>
              <div className="payment-kpi-icon orange-icon">
                <FiDollarSign />
              </div>
            </div>
          </div>
          <div className="payment-kpi-card green-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Amount Collected</p>
                <h3>₹{totalCollected.toLocaleString()}</h3>
              </div>
              <div className="payment-kpi-icon green-icon">
                <FiDownload />
              </div>
            </div>
          </div>
          <div className="payment-kpi-card red-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Balance Remaining</p>
                <h3>₹{totalBalance.toLocaleString()}</h3>
              </div>
              <div className="payment-kpi-icon red-icon">
                <FiAlertTriangle />
              </div>
            </div>
          </div>
          <div className="payment-kpi-card purple-card">
            <div className="payment-kpi-content">
              <div>
                <p className="payment-kpi-label">Items Settled</p>
                <h3>{itemsSettled} / {allItems.length}</h3>
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
                <h3 style={{ color: totalProfit >= 0 ? "#7e22ce" : "#dc2626" }}>
                  {totalProfit >= 0 ? "" : "-"}₹{Math.abs(totalProfit).toLocaleString()}
                </h3>
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
            placeholder="Search by client name, phone, or reference..."
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
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
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
                <th style={{ padding: "14px 20px" }}>Items</th>
                <th style={{ padding: "14px 20px" }}>Total Value</th>
                <th style={{ padding: "14px 20px" }}>Paid</th>
                <th style={{ padding: "14px 20px" }}>Balance Due</th>
                <th style={{ padding: "14px 20px" }}>Status</th>
                <th style={{ padding: "14px 20px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                    Loading ledger...
                  </td>
                </tr>
              ) : Object.keys(clientGroups).length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
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
                        <td style={{ padding: "16px 20px" }}>{group.items.length}</td>
                        <td style={{ padding: "16px 20px", fontWeight: "bold", color: "#0f172a" }}>
                          ₹{group.total_value.toLocaleString()}
                        </td>
                        <td style={{ padding: "16px 20px", fontWeight: "bold", color: "#16a34a" }}>
                          ₹{group.total_paid.toLocaleString()}
                        </td>
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

                      {/* Expanded: individual ledger items rows */}
                      {isExpanded &&
                        group.items.map((item, idx) => {
                          const itemBalance = item.balance;
                          return (
                            <tr
                              key={`${item.type}-${item.id}-${idx}`}
                              style={{ background: "#fafafa", borderBottom: "1px solid #f1f5f9" }}
                            >
                              <td style={{ padding: "12px 20px 12px 54px" }}>
                                <div style={{ fontWeight: "600", color: "#2563eb" }}>{item.reference}</div>
                                <div style={{ fontSize: "11px", color: "#64748b" }}>
                                  {new Date(item.date).toLocaleDateString()}
                                  <span style={{ marginLeft: 6, padding: "1px 4px", background: item.type === 'invoice' ? "#e0e7ff" : "#f1f5f9", borderRadius: 4, fontSize: "9px" }}>
                                    {item.type.toUpperCase()}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: "12px 20px", fontSize: "13px", color: "#475569" }}>
                                {item.item_desc}
                              </td>
                              <td style={{ padding: "12px 20px", fontWeight: "600", color: "#0f172a" }}>
                                ₹{item.total.toLocaleString()}
                              </td>
                              <td style={{ padding: "12px 20px", fontWeight: "600", color: "#16a34a" }}>
                                ₹{item.paid.toLocaleString()}
                              </td>
                              <td style={{ padding: "12px 20px", fontWeight: "600", color: itemBalance > 0 ? "#ef4444" : "#10b981" }}>
                                ₹{itemBalance.toLocaleString()}
                              </td>
                              <td style={{ padding: "12px 20px" }}>
                                <span className={`status-badge ${item.status === "Paid" ? "active" : item.status === "Partial" ? "booked" : "maintenance"}`}>
                                  {item.status || "Pending"}
                                </span>
                              </td>
                               <td style={{ padding: "12px 20px", display: "flex", gap: "8px", alignItems: "center" }}>
                                 {itemBalance > 0 && (
                                   <button
                                     className="btn-primary btn-sm"
                                     onClick={(e) => openPayModal(e, item)}
                                   >
                                     <FiPlus style={{ marginRight: 4 }} /> Log Payment
                                   </button>
                                 )}
                                 {itemBalance > 0 && group.client_phone && group.client_phone !== "N/A" && (
                                   <button
                                     className="btn-sm"
                                     onClick={(e) => sendReminder(e, group, item)}
                                     disabled={reminding === item.id}
                                     title="Send WhatsApp payment reminder"
                                     style={{
                                       background: reminding === item.id ? "#94a3b8" : "#16a34a",
                                       color: "white",
                                       border: "none",
                                       borderRadius: "6px",
                                       padding: "6px 10px",
                                       cursor: reminding === item.id ? "not-allowed" : "pointer",
                                       fontSize: "13px",
                                       fontWeight: 600,
                                       whiteSpace: "nowrap",
                                     }}
                                   >
                                     {reminding === item.id ? "Sending…" : "📲 Remind"}
                                   </button>
                                 )}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Log Payment Modal ── */}
        {showPayModal && payItem && (() => {
          const currentBalance = payItem.balance;
          const parsedAmount = parseFloat(amountReceived || 0);
          const newBalance = Math.max(0, currentBalance - parsedAmount);

          return (
            <div className="payment-modal-overlay">
              <div className="payment-modal" style={{ maxWidth: "460px" }}>
                <div className="payment-modal-top">
                  <h3>Log Payment ({payItem.type === "invoice" ? "Invoice" : "Trip"})</h3>
                  <button onClick={() => setShowPayModal(false)}>
                    <FiX />
                  </button>
                </div>

                <div style={{ padding: "10px 0 20px", color: "#475569", fontSize: "14px" }}>
                  <strong>Reference:</strong> {payItem.reference}<br />
                  <strong>Current Balance:</strong>{" "}
                  <span style={{ color: "#ef4444", fontWeight: 700 }}>
                    ₹{currentBalance.toLocaleString()}
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
                      max={currentBalance || 999999}
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder={`Max: ₹${currentBalance.toLocaleString()}`}
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
                        ₹{newBalance.toLocaleString()}
                      </strong>
                      {parsedAmount >= currentBalance && (
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
          );
        })()}
      </div>
    </div>
  );
};

export default Payments;