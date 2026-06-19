import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import InvoiceStatusBadge from "../../components/Admin/InvoiceStatusBadge";
import InvoiceStageBadge from "../../components/Admin/InvoiceStageBadge";
import WhatsAppSendButton from "../../components/Admin/WhatsAppSendButton";
import PaymentModal from "../../components/Admin/PaymentModal";
import { invoicesAPI, requireAuth, SERVER_URL } from "../../api";
import { FiPlus, FiSend, FiEye, FiDownload, FiTrash2, FiDollarSign, FiAlertTriangle } from "react-icons/fi";
import "../../styles/Admin/Invoices.css";

const STATUS_TABS = ["all", "draft", "sent", "partial", "paid", "overdue", "cancelled"];

function Invoices() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [invoices, setInvoices]       = useState([]);
  const [stats, setStats]             = useState({ total_outstanding: 0, overdue_amount: 0, paid_this_month: 0, draft_count: 0 });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [activeTab, setActiveTab]     = useState("all");
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState([]);
  const [sending, setSending]         = useState(null);   // invoice id being sent
  const [payInvoice, setPayInvoice]   = useState(null);   // invoice for payment modal

  useEffect(() => {
    requireAuth();
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [invList, invStats] = await Promise.all([
        invoicesAPI.list(),
        invoicesAPI.stats(),
      ]);
      setInvoices(invList);
      setStats(invStats);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      inv.invoice_number?.toLowerCase().includes(q) ||
      (inv.recipient_details?.name || "").toLowerCase().includes(q);
    const matchesTab = activeTab === "all" || inv.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const selectedDrafts = selected.filter((id) => {
    const inv = invoices.find((i) => i.id === id);
    return inv?.status === "draft";
  });

  async function handleSend(inv) {
    if (!window.confirm(`Generate PDF and send "${inv.invoice_number}" to ${(inv.recipient_details?.name) || "customer"}?`)) return;
    try {
      setSending(inv.id);
      await invoicesAPI.send(inv.id);
      loadData();
    } catch (err) {
      alert("Failed to send: " + err.message);
    } finally {
      setSending(null);
    }
  }

  async function handleDelete(inv) {
    if (!window.confirm(`Delete draft invoice "${inv.invoice_number}"?`)) return;
    try {
      await invoicesAPI.delete(inv.id);
      loadData();
    } catch (err) {
      alert("Failed: " + err.message);
    }
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Delete ${selectedDrafts.length} draft invoice(s)?`)) return;
    try {
      await Promise.all(selectedDrafts.map((id) => invoicesAPI.delete(id)));
      setSelected([]);
      loadData();
    } catch (err) {
      alert("Some deletions failed: " + err.message);
    }
  }

  async function handlePayment(data) {
    await invoicesAPI.recordPayment(payInvoice.id, data);
    loadData();
  }

  function toggleSelect(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const currency = "₹";
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const balance = (inv) => Math.max(0, (inv.total_amount || 0) - (inv.paid_amount || 0));

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* Header */}
        <div className="inv-header-row">
          <div>
            <h2 className="inv-page-title">Invoices</h2>
            <div className="inv-breadcrumb">Dashboard <span>›</span> Invoices</div>
          </div>
          <button id="btn-create-invoice" className="btn-add-customer" onClick={() => navigate("/invoices/create")}>
            <FiPlus /> Create Invoice
          </button>
        </div>

        {error && <div style={{ margin: "0 32px 16px", color: "#ef4444", fontWeight: 600 }}>⚠ {error}</div>}

        <div className="inv-kpi-grid">
          <div className="inv-kpi-card red">
            <div className="inv-kpi-label">Total Outstanding</div>
            <div className="inv-kpi-value">{currency}{(stats.total_outstanding || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div className="inv-kpi-sub">Unpaid invoices</div>
          </div>
          <div className="inv-kpi-card red">
            <div className="inv-kpi-label">Overdue Amount</div>
            <div className="inv-kpi-value">{currency}{(stats.overdue_amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div className="inv-kpi-sub">Past due date</div>
          </div>
          <div className="inv-kpi-card green">
            <div className="inv-kpi-label">Paid This Month</div>
            <div className="inv-kpi-value">{currency}{(stats.paid_this_month || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div className="inv-kpi-sub">Current month</div>
          </div>
          <div className="inv-kpi-card">
            <div className="inv-kpi-label">Draft Invoices</div>
            <div className="inv-kpi-value">{stats.draft_count || 0}</div>
            <div className="inv-kpi-sub">Unsent drafts</div>
          </div>
        </div>

        {/* Monthly Revenue Chart */}
        {stats.monthly_revenue && stats.monthly_revenue.length > 0 && (
          <div style={{ margin: "0 32px 24px", background: "white", padding: 20, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#0f172a" }}>Monthly Revenue (Last 6 Months)</h3>
            <div style={{ display: "flex", alignItems: "flex-end", height: 120, gap: 12, marginTop: 12 }}>
              {(() => {
                const maxVal = Math.max(...stats.monthly_revenue.map(r => r.total), 1); // Avoid div by 0
                return stats.monthly_revenue.map((m, i) => {
                  const hPct = (m.total / maxVal) * 100;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%" }}>
                      <div style={{
                        width: "100%", maxWidth: 40, background: "#3b82f6", borderRadius: "4px 4px 0 0",
                        height: `${hPct}%`, minHeight: m.total > 0 ? "4px" : "0", alignSelf: "flex-end", transition: "height 0.5s ease"
                      }} title={`${m.month}: ${currency}${m.total.toLocaleString("en-IN")}`} />
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>{m.month.split(" ")[0]}</div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Status Tabs */}
        <div className="inv-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              className={`inv-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab !== "all" && <span style={{ marginLeft: 6, background: "rgba(0,0,0,.1)", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>
                {invoices.filter((i) => i.status === tab).length}
              </span>}
            </button>
          ))}
        </div>

        {/* Filter */}
        <div className="inv-filter-bar">
          <input
            id="inv-search"
            className="inv-search-input"
            placeholder="Search by invoice # or customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Bulk bar */}
        {selected.length > 0 && (
          <div className="inv-bulk-bar">
            <span>{selected.length} selected ({selectedDrafts.length} drafts)</span>
            {selectedDrafts.length > 0 && (
              <button className="inv-bulk-delete-btn" onClick={handleBulkDelete}>
                <FiTrash2 style={{ marginRight: 4 }} /> Delete Drafts
              </button>
            )}
            <button style={{ background: "none", border: "none", color: "#1e40af", cursor: "pointer", fontWeight: 600 }} onClick={() => setSelected([])}>Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="inv-table-panel">
          <table className="inv-table">
            <thead>
              <tr>
                <th style={{ padding: "13px 16px", width: 32 }}>
                  <input type="checkbox" className="inv-checkbox"
                    checked={selected.length === filtered.length && filtered.length > 0}
                    onChange={(e) => setSelected(e.target.checked ? filtered.map((i) => i.id) : [])}
                  />
                </th>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" className="inv-empty">Loading invoices...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="10" className="inv-empty">
                  {search ? "No invoices match your search." : "No invoices found. Click \"Create Invoice\" to get started."}
                </td></tr>
              ) : (
                filtered.map((inv) => {
                  const bal = balance(inv);
                  return (
                    <tr key={inv.id}>
                      <td style={{ padding: "13px 16px" }}>
                        <input type="checkbox" className="inv-checkbox"
                          checked={selected.includes(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span className="inv-number-link" onClick={() => navigate(`/invoices/${inv.id}`)}>
                            {inv.invoice_number}
                          </span>
                          {inv.invoice_stage !== "final" && (
                            <InvoiceStageBadge stage={inv.invoice_stage} />
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{(inv.recipient_details?.name) || "—"}</div>
                      </td>
                      <td>{fmtDate(inv.issue_date)}</td>
                      <td style={{ color: inv.status === "overdue" ? "#dc2626" : "#374151" }}>{fmtDate(inv.due_date)}</td>
                      <td className="inv-amount">{currency}{(inv.total_amount || 0).toLocaleString()}</td>
                      <td style={{ color: "#16a34a", fontWeight: 600 }}>{currency}{(inv.paid_amount || 0).toLocaleString()}</td>
                      <td className={bal > 0 ? "inv-balance-due" : "inv-balance-nil"}>
                        {currency}{bal.toLocaleString()}
                      </td>
                      <td><InvoiceStatusBadge status={inv.status} /></td>
                      <td>
                        <div className="inv-actions-cell" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <button className="inv-action-btn" title="View" onClick={() => navigate(`/invoices/${inv.id}`)}>
                            <FiEye />
                          </button>
                          {inv.status === "draft" && (
                            <button
                              className="inv-action-btn primary"
                              title="Send Email"
                              onClick={() => handleSend(inv)}
                              disabled={sending === inv.id}
                            >
                              <FiSend />
                            </button>
                          )}
                          {inv.pdf_url && (
                            <button className="inv-action-btn" title="Download PDF"
                              onClick={() => window.open(`${SERVER_URL}${inv.pdf_url}`, "_blank")}>
                              <FiDownload />
                            </button>
                          )}
                          {["draft", "sent", "viewed", "partial", "overdue"].includes(inv.status) && (
                            <WhatsAppSendButton invoiceId={inv.id} onSuccess={loadData} />
                          )}
                          {["sent", "viewed", "partial", "overdue"].includes(inv.status) && (
                            <button className="inv-action-btn" title="Record Payment" onClick={() => setPayInvoice(inv)}>
                              <FiDollarSign />
                            </button>
                          )}
                          {inv.status === "draft" && (
                            <button className="inv-action-btn danger" title="Delete" onClick={() => handleDelete(inv)}>
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Payment Modal */}
        {payInvoice && (
          <PaymentModal
            invoice={payInvoice}
            onClose={() => setPayInvoice(null)}
            onSave={handlePayment}
          />
        )}
      </div>
    </div>
  );
}

export default Invoices;
