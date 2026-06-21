import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import InvoiceStatusBadge from "../../components/Admin/InvoiceStatusBadge";
import InvoiceStageBadge from "../../components/Admin/InvoiceStageBadge";
import WhatsAppSendButton from "../../components/Admin/WhatsAppSendButton";
import PaymentModal from "../../components/Admin/PaymentModal";
import { invoicesAPI, requireAuth, SERVER_URL } from "../../api";
import {
  FiArrowLeft, FiSend, FiDownload, FiTrash2, FiDollarSign,
  FiRefreshCw, FiCheck, FiFileText,
} from "react-icons/fi";
import "../../styles/Admin/InvoiceDetails.css";

function InvoiceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [invoice, setInvoice]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [sending, setSending]         = useState(false);
  const [converting, setConverting]   = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  async function loadInvoice() {
    try {
      setLoading(true);
      const data = await invoicesAPI.get(id);
      setInvoice(data);
    } catch (err) {
      setError(err.message || "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    requireAuth();
    loadInvoice();
  }, [id]);

  async function handleSend() {
    if (!window.confirm("Generate PDF and send this invoice via email?")) return;
    try {
      setSending(true);
      const updated = await invoicesAPI.send(id);
      setInvoice(updated);
      alert("Invoice sent successfully!");
    } catch (err) {
      setError("Send failed: " + err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleConvertProforma() {
    if (!window.confirm("Convert this proforma into a Final billable invoice?")) return;
    try {
      setConverting(true);
      const newInvoice = await invoicesAPI.convertProforma(id, {});
      navigate(`/invoices/${newInvoice.id}`);
    } catch (err) {
      alert("Conversion failed: " + err.message);
    } finally {
      setConverting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this draft invoice? This cannot be undone.")) return;
    try {
      await invoicesAPI.delete(id);
      navigate("/invoices");
    } catch (err) {
      setError("Delete failed: " + err.message);
    }
  }

  async function handlePayment(data) {
    const updated = await invoicesAPI.recordPayment(id, data);
    setInvoice(updated);
  }

  if (loading) return (
    <div className="dashboard-layout invd-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <div className="invd-loading">Loading invoice...</div>
      </div>
    </div>
  );

  if (error && !invoice) return (
    <div className="dashboard-layout invd-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <div className="invd-error">⚠ {error}</div>
      </div>
    </div>
  );

  const currency = invoice.currency === "INR" ? "₹" : invoice.currency;
  const balance = Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0));
  const fmtDate = (d) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); }
    catch { return d; }
  };
  const fmtDateTime = (d) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return d; }
  };

  const issuer    = invoice.issuer_details    || {};
  const recipient = invoice.recipient_details || {};
  const status    = invoice.status;

  // Build activity log from available timestamps
  const activity = [
    invoice.created_at && { label: "Invoice Created", time: invoice.created_at, color: "#2563eb" },
    invoice.issue_date && invoice.issue_date !== invoice.created_at && { label: "Issue Date", time: invoice.issue_date, color: "#7c3aed" },
    (status === "sent" || status === "viewed" || status === "paid" || status === "partial" || status === "overdue") &&
      invoice.updated_at && { label: "Sent to Customer", time: invoice.updated_at, color: "#d97706" },
    invoice.paid_date && { label: "Fully Paid", time: invoice.paid_date, color: "#16a34a" },
  ].filter(Boolean);

  return (
    <div className="dashboard-layout invd-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* Header */}
        <div className="invd-header-row">
          <div className="invd-title-group">
            <h2>
              {invoice.invoice_number}
              <InvoiceStatusBadge status={status} size="lg" />
              {invoice.invoice_stage !== "final" && (
                <InvoiceStageBadge stage={invoice.invoice_stage} size="lg" />
              )}
            </h2>
            <div className="invd-breadcrumb">
              Dashboard <span>›</span>
              <span style={{ cursor: "pointer", color: "#2563eb" }} onClick={() => navigate("/invoices")}>Invoices</span>
              <span>›</span> {invoice.invoice_number}
            </div>
          </div>
          <button className="invd-back-btn" onClick={() => navigate("/invoices")}>
            <FiArrowLeft /> Back to Invoices
          </button>
        </div>

        {error && <div className="invd-error">⚠ {error}</div>}

        {/* Action Bar — context-sensitive */}
        <div className="invd-action-bar">
          {status === "draft" && (
            <>
              <button id="invd-btn-send" className="invd-btn primary" onClick={handleSend} disabled={sending}>
                <FiSend /> {sending ? "Sending..." : "Send Email"}
              </button>
              <WhatsAppSendButton invoiceId={invoice.id} onSuccess={setInvoice} />
              <button id="invd-btn-delete" className="invd-btn danger" onClick={handleDelete}>
                <FiTrash2 /> Delete Draft
              </button>
            </>
          )}
          {["sent", "viewed"].includes(status) && (
            <>
              <button className="invd-btn secondary" onClick={handleSend} disabled={sending}>
                <FiRefreshCw /> {sending ? "Resending..." : "Resend Email"}
              </button>
              <WhatsAppSendButton invoiceId={invoice.id} onSuccess={setInvoice} />
            </>
          )}
          {invoice.invoice_stage !== "final" && (
            <button className="invd-btn primary" onClick={handleConvertProforma} disabled={converting} style={{ background: "#4f46e5" }}>
              <FiFileText /> {converting ? "Converting..." : "Convert to Final"}
            </button>
          )}
          {["sent", "viewed", "partial", "overdue"].includes(status) && (
            <button id="invd-btn-pay" className="invd-btn success" onClick={() => setShowPayModal(true)}>
              <FiDollarSign /> Record Payment
            </button>
          )}
          {invoice.pdf_url && (
            <button className="invd-btn secondary" onClick={() => window.open(`${SERVER_URL}${invoice.pdf_url}?t=${Date.now()}`, "_blank")}>
              <FiDownload /> Download PDF
            </button>
          )}
          {status === "paid" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#16a34a", fontWeight: 600, fontSize: 14 }}>
              <FiCheck /> Fully Paid on {fmtDate(invoice.paid_date)}
            </div>
          )}
        </div>

        {/* Body Grid */}
        <div className="invd-body">
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Party info */}
            <div className="invd-card">
              <div className="invd-card-header"><h3>Invoice Parties</h3></div>
              <div className="invd-card-body">
                <div className="invd-party-grid">
                  <div className="invd-party-box">
                    <div className="invd-party-label">Bill From</div>
                    <div className="invd-party-name">{issuer.name || "—"}</div>
                    {issuer.address && <div className="invd-party-detail">{issuer.address}</div>}
                    {issuer.gst && <div className="invd-party-detail">GST: {issuer.gst}</div>}
                    {issuer.phone && <div className="invd-party-detail">📞 {issuer.phone}</div>}
                    {issuer.email && <div className="invd-party-detail">✉ {issuer.email}</div>}
                  </div>
                  <div className="invd-party-box" style={{ background: "#eff6ff" }}>
                    <div className="invd-party-label" style={{ color: "#2563eb" }}>Bill To</div>
                    <div className="invd-party-name">{recipient.name || "—"}</div>
                    {recipient.address && <div className="invd-party-detail">{recipient.address}</div>}
                    {recipient.gst && <div className="invd-party-detail">GST: {recipient.gst}</div>}
                    {recipient.phone && <div className="invd-party-detail">📞 {recipient.phone}</div>}
                    {recipient.email && <div className="invd-party-detail">✉ {recipient.email}</div>}
                  </div>
                </div>
                {/* Dates row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Issue Date</div>
                    <div style={{ fontWeight: 600, color: "#0f172a" }}>{fmtDate(invoice.issue_date)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Due Date</div>
                    <div style={{ fontWeight: 600, color: status === "overdue" ? "#dc2626" : "#0f172a" }}>{fmtDate(invoice.due_date)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Currency</div>
                    <div style={{ fontWeight: 600, color: "#0f172a" }}>{invoice.currency}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="invd-card">
              <div className="invd-card-header"><h3>Line Items</h3></div>
              <div>
                <table className="invd-items-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoice.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ color: "#94a3b8", width: 32 }}>{idx + 1}</td>
                        <td>{item.description}</td>
                        <td style={{ color: "#64748b" }}>{item.unit}</td>
                        <td style={{ color: "#64748b" }}>{item.quantity}</td>
                        <td>{currency}{(item.rate || 0).toLocaleString()}</td>
                        <td>{currency}{(item.amount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes & Terms */}
            {(invoice.notes || invoice.terms) && (
              <div className="invd-card">
                <div className="invd-card-header"><h3>Notes & Terms</h3></div>
                <div className="invd-card-body">
                  {invoice.notes && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>NOTES</div>
                      <p style={{ margin: 0, color: "#374151", fontSize: 14 }}>{invoice.notes}</p>
                    </div>
                  )}
                  {invoice.terms && (
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>TERMS</div>
                      <p style={{ margin: 0, color: "#374151", fontSize: 14 }}>{invoice.terms}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="invd-sidebar">

            {/* Totals */}
            <div className="invd-card">
              <div className="invd-card-header"><h3>Summary</h3></div>
              <div className="invd-card-body">
                <div className="invd-totals">
                  <div className="invd-total-row">
                    <span className="invd-total-label">Subtotal</span>
                    <span>{currency}{(invoice.subtotal || 0).toLocaleString()}</span>
                  </div>
                  <div className="invd-total-row">
                    <span className="invd-total-label">Tax ({invoice.tax_rate || 0}%)</span>
                    <span>+ {currency}{(invoice.tax_amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="invd-total-row">
                    <span className="invd-total-label">Discount</span>
                    <span style={{ color: (invoice.discount || 0) > 0 ? "#dc2626" : undefined }}>
                      {(invoice.discount || 0) > 0 ? `- ${currency}${invoice.discount.toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <div className="invd-total-row grand">
                    <span>Total</span>
                    <span>{currency}{(invoice.total_amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="invd-total-row">
                    <span className="invd-total-label" style={{ color: "#16a34a" }}>Paid</span>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>{currency}{(invoice.paid_amount || 0).toLocaleString()}</span>
                  </div>
                  <div className={`invd-total-row balance ${balance <= 0 ? "settled" : ""}`}>
                    <span>Balance Due</span>
                    <span>{currency}{balance.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment history */}
            {(invoice.payment_records || []).length > 0 && (
              <div className="invd-card">
                <div className="invd-card-header"><h3>Payment History</h3></div>
                <div className="invd-card-body">
                  {invoice.payment_records.map((rec, i) => (
                    <div key={i} className="invd-payment-record">
                      <div>
                        <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14 }}>
                          {currency}{(rec.amount || 0).toLocaleString()}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{fmtDateTime(rec.recorded_at)}</div>
                        {rec.notes && <div style={{ fontSize: 12, color: "#94a3b8" }}>{rec.notes}</div>}
                      </div>
                      <span className="invd-payment-badge">{rec.method || "cash"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity Log */}
            <div className="invd-card">
              <div className="invd-card-header"><h3>Activity Log</h3></div>
              <div className="invd-card-body">
                {activity.map((log, i) => (
                  <div key={i} className="invd-log-item">
                    <div className="invd-log-dot" style={{ background: log.color }} />
                    <div>
                      <div className="invd-log-label">{log.label}</div>
                      <div className="invd-log-time">{fmtDateTime(log.time)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Modal */}
        {showPayModal && (
          <PaymentModal
            invoice={invoice}
            onClose={() => setShowPayModal(false)}
            onSave={handlePayment}
          />
        )}
      </div>
    </div>
  );
}

export default InvoiceDetails;
