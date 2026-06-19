import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import InvoiceStatusBadge from "../../components/Admin/InvoiceStatusBadge";
import { customersAPI, invoicesAPI, tripsAPI, requireAuth } from "../../api";
import { FiArrowLeft, FiFileText, FiPlus } from "react-icons/fi";
import "../../styles/Admin/Customers.css";
import "../../styles/Admin/InvoiceDetails.css";

function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [customer, setCustomer]       = useState(null);
  const [invoices, setInvoices]       = useState([]);
  const [trips, setTrips]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [activeTab, setActiveTab]     = useState("invoices");

  useEffect(() => {
    requireAuth();
    
    async function load() {
      try {
        setLoading(true);
        const [cust, invs, tripsData] = await Promise.all([
          customersAPI.get(id),
          invoicesAPI.list({ customer_id: id }),
          tripsAPI.list(),
        ]);
        setCustomer(cust);
        setInvoices(invs);
        // Filter trips that match this customer by name
        setTrips(tripsData.filter((t) => t.client_name?.toLowerCase() === cust.name?.toLowerCase()));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  const currency = "₹";
  const totalInvoiced = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalPaid     = invoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const totalBalance  = totalInvoiced - totalPaid;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="dashboard-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="invd-header-row">
          <div className="invd-title-group">
            <h2>{loading ? "Loading..." : customer?.name || "Customer"}</h2>
            <div className="invd-breadcrumb">Dashboard <span>›</span> <span onClick={() => navigate("/customers")} style={{ cursor: "pointer", color: "#2563eb" }}>Customers</span> <span>›</span> Details</div>
          </div>
          <button className="invd-back-btn" onClick={() => navigate("/customers")}><FiArrowLeft /> Back</button>
        </div>

        {error && <div className="invd-error">⚠ {error}</div>}

        {!loading && customer && (
          <div style={{ padding: "0 32px 40px" }}>
            {/* Profile card */}
            <div className="invd-card" style={{ marginBottom: 20 }}>
              <div className="invd-card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Contact Person</div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{customer.contact_person || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Email</div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{customer.email || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Phone</div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{customer.phone || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>GST Number</div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{customer.gst_number || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Address</div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{customer.address || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Payment Terms</div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{customer.payment_terms_days} days</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Total Invoiced</div>
                  <div style={{ fontWeight: 700, color: "#2563eb", fontSize: 18 }}>{currency}{totalInvoiced.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Outstanding</div>
                  <div style={{ fontWeight: 700, color: totalBalance > 0 ? "#dc2626" : "#16a34a", fontSize: 18 }}>{currency}{Math.max(0, totalBalance).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              <button
                className={`inv-tab ${activeTab === "invoices" ? "active" : ""}`}
                onClick={() => setActiveTab("invoices")}
              >
                <FiFileText style={{ marginRight: 6 }} />Invoices ({invoices.length})
              </button>
              <button
                className={`inv-tab ${activeTab === "trips" ? "active" : ""}`}
                onClick={() => setActiveTab("trips")}
              >
                Trips ({trips.length})
              </button>
            </div>

            {/* Invoices tab */}
            {activeTab === "invoices" && (
              <div className="invd-card">
                <div className="invd-card-header">
                  <h3>Invoice History</h3>
                  <button className="invd-btn primary" onClick={() => navigate(`/invoices/create?customer_id=${id}`)}>
                    <FiPlus /> New Invoice
                  </button>
                </div>
                <div>
                  {invoices.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                      No invoices yet for this customer.
                    </div>
                  ) : (
                    <table className="inv-table">
                      <thead>
                        <tr>
                          <th style={{ padding: "13px 16px" }}>Invoice #</th>
                          <th style={{ padding: "13px 16px" }}>Issue Date</th>
                          <th style={{ padding: "13px 16px" }}>Due Date</th>
                          <th style={{ padding: "13px 16px" }}>Total</th>
                          <th style={{ padding: "13px 16px" }}>Paid</th>
                          <th style={{ padding: "13px 16px" }}>Status</th>
                          <th style={{ padding: "13px 16px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td style={{ padding: "13px 16px" }}>
                              <span className="inv-number-link" onClick={() => navigate(`/invoices/${inv.id}`)}>
                                {inv.invoice_number}
                              </span>
                            </td>
                            <td style={{ padding: "13px 16px" }}>{fmtDate(inv.issue_date)}</td>
                            <td style={{ padding: "13px 16px" }}>{fmtDate(inv.due_date)}</td>
                            <td style={{ padding: "13px 16px", fontWeight: 600 }}>{currency}{(inv.total_amount || 0).toLocaleString()}</td>
                            <td style={{ padding: "13px 16px", color: "#16a34a", fontWeight: 600 }}>{currency}{(inv.paid_amount || 0).toLocaleString()}</td>
                            <td style={{ padding: "13px 16px" }}><InvoiceStatusBadge status={inv.status} /></td>
                            <td style={{ padding: "13px 16px" }}>
                              <button className="inv-action-btn" onClick={() => navigate(`/invoices/${inv.id}`)}>View</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Trips tab */}
            {activeTab === "trips" && (
              <div className="invd-card">
                <div className="invd-card-header">
                  <h3>Associated Trips</h3>
                </div>
                <div>
                  {trips.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>No trips found for this customer.</div>
                  ) : (
                    <table className="inv-table">
                      <thead>
                        <tr>
                          <th style={{ padding: "13px 16px" }}>Trip ID</th>
                          <th style={{ padding: "13px 16px" }}>Route</th>
                          <th style={{ padding: "13px 16px" }}>Date</th>
                          <th style={{ padding: "13px 16px" }}>Status</th>
                          <th style={{ padding: "13px 16px" }}>Invoiced</th>
                          <th style={{ padding: "13px 16px" }}>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trips.map((t) => (
                          <tr key={t.id}>
                            <td style={{ padding: "13px 16px", fontWeight: 600, color: "#2563eb" }}>{t.trip_id}</td>
                            <td style={{ padding: "13px 16px", fontSize: 13, color: "#475569" }}>{t.pickup_location} → {t.drop_location}</td>
                            <td style={{ padding: "13px 16px" }}>{fmtDate(t.reporting_time)}</td>
                            <td style={{ padding: "13px 16px" }}>
                              <span className={`status-badge ${t.trip_status?.toLowerCase().replace(" ", "-")}`}>{t.trip_status}</span>
                            </td>
                            <td style={{ padding: "13px 16px" }}>
                              {t.is_invoiced
                                ? <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Yes</span>
                                : <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>No</span>
                              }
                            </td>
                            <td style={{ padding: "13px 16px", fontWeight: 600 }}>{currency}{(t.trip_cost || t.balance_amount || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerDetails;
