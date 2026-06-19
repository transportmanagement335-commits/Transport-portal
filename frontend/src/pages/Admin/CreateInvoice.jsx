import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../../components/Admin/Sidebar";
import Topbar from "../../components/Admin/Topbar";
import { customersAPI, tripsAPI, invoicesAPI, requireAuth } from "../../api";
import { FiPlus, FiX, FiArrowLeft, FiArrowRight } from "react-icons/fi";
import "../../styles/Admin/CreateInvoice.css";

const UNITS = ["trip", "km", "ton", "hour", "fixed"];
const EMPTY_ITEM = { description: "", quantity: 1, unit: "trip", rate: 0 };

function CreateInvoice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCustomer = searchParams.get("customer_id");

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [customers, setCustomers]     = useState([]);
  const [trips, setTrips]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  // Form state
  const [customerId, setCustomerId]   = useState(preselectedCustomer || "");
  const [tripId, setTripId]           = useState("");  // optional auto-fill trip
  const [items, setItems]             = useState([{ ...EMPTY_ITEM }]);
  const [taxRate, setTaxRate]         = useState(0);
  const [discount, setDiscount]       = useState(0);
  const [dueDate, setDueDate]         = useState("");
  const [notes, setNotes]             = useState("");
  const [terms, setTerms]             = useState("Payment due within 30 days");
  const [invoiceType, setInvoiceType] = useState("customer");
  const [invoiceStage, setInvoiceStage] = useState("final");

  useEffect(() => {
    requireAuth();
    async function load() {
      try {
        const [custs, tripsData] = await Promise.all([
          customersAPI.list(),
          tripsAPI.list(),
        ]);
        setCustomers(custs.filter((c) => c.is_active));
        // Only uninvoiced, completed trips
        setTrips(tripsData.filter((t) => t.trip_status === "Completed" && !t.is_invoiced));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Auto-fill from selected trip
  useEffect(() => {
    if (!tripId) return;
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    const route = `${trip.pickup_location} → ${trip.drop_location}`;
    const cost  = trip.trip_cost || trip.balance_amount || 0;
    setItems([{ description: `Freight Charges: ${route}`, quantity: 1, unit: "trip", rate: cost }]);
    // Try to match customer
    const matchCust = customers.find((c) => c.name?.toLowerCase() === trip.client_name?.toLowerCase());
    if (matchCust) setCustomerId(matchCust.id);
  }, [tripId]);

  // Live totals calculation
  const { subtotal, taxAmount, total } = useMemo(() => {
    const sub = items.reduce((s, it) => s + (parseFloat(it.quantity || 0) * parseFloat(it.rate || 0)), 0);
    const tax = Math.round(sub * (parseFloat(taxRate || 0) / 100) * 100) / 100;
    const tot = Math.round((sub + tax - parseFloat(discount || 0)) * 100) / 100;
    return { subtotal: Math.round(sub * 100) / 100, taxAmount: tax, total: Math.max(0, tot) };
  }, [items, taxRate, discount]);

  function updateItem(index, field, value) {
    setItems((prev) => prev.map((it, i) => i === index ? { ...it, [field]: value } : it));
  }
  function addItem() { setItems((prev) => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(index) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!customerId) { setError("Please select a customer."); return; }
    if (items.some((it) => !it.description.trim())) { setError("All line items must have a description."); return; }
    if (!dueDate) { setError("Due date is required."); return; }

    try {
      setSaving(true);
      setError("");
      const payload = {
        invoice_type: invoiceType,
        invoice_stage: invoiceStage,
        recipient_id: customerId,
        items: items.map((it) => ({
          description: it.description,
          quantity: parseFloat(it.quantity) || 1,
          unit: it.unit,
          rate: parseFloat(it.rate) || 0,
          trip_id: tripId || null,
        })),
        tax_rate: parseFloat(taxRate) || 0,
        discount: parseFloat(discount) || 0,
        due_date: new Date(dueDate).toISOString(),
        notes,
        terms,
        trip_ids: tripId ? [tripId] : [],
      };
      const created = await invoicesAPI.create(payload);
      navigate(`/invoices/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const currency = "₹";
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="dashboard-layout ci-layout">
      <Sidebar sidebarOpen={sidebarOpen} />
      <div className={`dashboard-content ${sidebarOpen ? "sidebar-open" : "sidebar-close"}`}>
        <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        {/* Header */}
        <div className="ci-header-row">
          <div>
            <h2 className="ci-page-title">Create Invoice</h2>
            <div className="ci-breadcrumb">
              Dashboard <span>›</span>
              <span onClick={() => navigate("/invoices")} style={{ cursor: "pointer", color: "#2563eb" }}>Invoices</span>
              <span>›</span> Create
            </div>
          </div>
          <button className="invd-back-btn" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => navigate("/invoices")}>
            <FiArrowLeft /> Back
          </button>
        </div>

        {error && <div className="ci-error" style={{ margin: "0 32px 16px" }}>⚠ {error}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="ci-grid">
              {/* Left panel */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Step 1: Select Customer */}
                <div className="ci-card">
                  <div className="ci-card-header"><h3>① Select Customer</h3></div>
                  <div className="ci-card-body">
                    <div className="ci-form-grid">
                      <div className="ci-field">
                        <label>Invoice Type</label>
                        <select id="ci-inv-type" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
                          <option value="customer">Customer Invoice</option>
                          <option value="vendor">Vendor Invoice</option>
                        </select>
                      </div>
                      <div className="ci-field">
                        <label>Invoice Stage</label>
                        <select id="ci-inv-stage" value={invoiceStage} onChange={(e) => setInvoiceStage(e.target.value)}>
                          <option value="final">Final Invoice</option>
                          <option value="proforma">Proforma Invoice</option>
                          <option value="advance">Advance Invoice</option>
                        </select>
                      </div>
                      <div className="ci-field">
                        <label>Customer *</label>
                        <select id="ci-customer" required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                          <option value="">-- Select Customer --</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Auto-fill from Trip */}
                <div className="ci-card">
                  <div className="ci-card-header"><h3>② Auto-fill from Trip <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>(optional)</span></h3></div>
                  <div className="ci-card-body">
                    <div className="ci-field">
                      <label>Completed Uninvoiced Trip</label>
                      <select id="ci-trip" value={tripId} onChange={(e) => setTripId(e.target.value)}>
                        <option value="">-- None (manual entry) --</option>
                        {trips.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.trip_id} · {t.client_name} · {t.pickup_location} → {t.drop_location} · ₹{(t.trip_cost || t.balance_amount || 0).toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>
                    {trips.length === 0 && (
                      <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>
                        No completed uninvoiced trips found.
                      </p>
                    )}
                  </div>
                </div>

                {/* Step 3: Line Items */}
                <div className="ci-card">
                  <div className="ci-card-header"><h3>③ Line Items</h3></div>
                  <div className="ci-card-body">
                    {/* Header row */}
                    <div className="ci-items-header ci-item-cols" style={{ display: "grid" }}>
                      <span>Description</span><span>Qty</span><span>Unit</span><span>Rate (₹)</span><span style={{ textAlign: "right" }}>Amount</span><span></span>
                    </div>
                    {items.map((item, idx) => (
                      <div key={idx} className="ci-item-row ci-item-cols">
                        <input
                          id={`ci-item-desc-${idx}`}
                          className="ci-item-input"
                          placeholder="e.g. Freight charges Mumbai → Delhi"
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          required
                        />
                        <input
                          id={`ci-item-qty-${idx}`}
                          className="ci-item-input"
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        />
                        <select
                          id={`ci-item-unit-${idx}`}
                          className="ci-item-input"
                          value={item.unit}
                          onChange={(e) => updateItem(idx, "unit", e.target.value)}
                        >
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input
                          id={`ci-item-rate-${idx}`}
                          className="ci-item-input"
                          type="number"
                          min="0"
                          step="any"
                          value={item.rate}
                          onChange={(e) => updateItem(idx, "rate", e.target.value)}
                        />
                        <div className="ci-item-amount">
                          {currency}{(parseFloat(item.quantity || 0) * parseFloat(item.rate || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </div>
                        <button type="button" className="ci-remove-btn" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                          <FiX />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="ci-add-item-btn" onClick={addItem}>
                      <FiPlus style={{ marginRight: 6 }} /> Add Line Item
                    </button>
                  </div>
                </div>

                {/* Step 4: Financials & Dates */}
                <div className="ci-card">
                  <div className="ci-card-header"><h3>④ Financials & Details</h3></div>
                  <div className="ci-card-body">
                    <div className="ci-form-grid">
                      <div className="ci-field">
                        <label>Tax Rate (%)</label>
                        <input id="ci-tax" type="number" min="0" max="100" step="0.01" className="ci-input" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                      </div>
                      <div className="ci-field">
                        <label>Discount (flat ₹)</label>
                        <input id="ci-discount" type="number" min="0" step="0.01" className="ci-input" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                      </div>
                      <div className="ci-field">
                        <label>Due Date *</label>
                        <input id="ci-due-date" type="date" className="ci-input" min={today} required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      </div>
                      <div className="ci-field">
                        <label>Terms</label>
                        <input id="ci-terms" type="text" className="ci-input" value={terms} onChange={(e) => setTerms(e.target.value)} />
                      </div>
                      <div className="ci-field ci-full-width">
                        <label>Notes</label>
                        <textarea id="ci-notes" className="ci-input" rows="3" placeholder="Any additional notes for the customer..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div>
                <div className="ci-preview-card">
                  <div className="ci-preview-header">
                    <h3>Live Preview</h3>
                    <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>
                      {customerId
                        ? customers.find((c) => c.id === customerId)?.name || ""
                        : "Select a customer"}
                    </div>
                  </div>
                  <div className="ci-preview-body">
                    <div className="ci-preview-row">
                      <span className="ci-preview-label">Items</span>
                      <span className="ci-preview-value">{items.length}</span>
                    </div>
                    <div className="ci-preview-row">
                      <span className="ci-preview-label">Subtotal</span>
                      <span className="ci-preview-value">{currency}{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="ci-preview-row">
                      <span className="ci-preview-label">Tax ({taxRate || 0}%)</span>
                      <span className="ci-preview-value">+ {currency}{taxAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="ci-preview-row">
                      <span className="ci-preview-label">Discount</span>
                      <span className="ci-preview-value" style={{ color: discount > 0 ? "#dc2626" : undefined }}>
                        {discount > 0 ? `- ${currency}${parseFloat(discount).toLocaleString()}` : "—"}
                      </span>
                    </div>
                    <div className="ci-preview-row total">
                      <span>Total</span>
                      <span>{currency}{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    </div>
                    {dueDate && (
                      <div className="ci-preview-row">
                        <span className="ci-preview-label">Due</span>
                        <span className="ci-preview-value" style={{ color: "#dc2626" }}>
                          {new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "0 16px 20px" }}>
                    <button
                      type="submit"
                      id="ci-submit"
                      className="ci-submit-btn"
                      disabled={saving || !customerId || !dueDate}
                    >
                      {saving ? "Creating..." : "✓ Create Invoice"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default CreateInvoice;
