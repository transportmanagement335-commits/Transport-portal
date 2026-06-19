/**
 * PaymentModal — modal form to record a payment against an invoice.
 * Props:
 *   invoice   — the invoice object
 *   onClose() — callback to close modal
 *   onSave(data) — async callback with { amount, method, notes }
 */
import { useState } from "react";
import { FiX, FiCheck } from "react-icons/fi";

function PaymentModal({ invoice, onClose, onSave }) {
  const [amount, setAmount]     = useState("");
  const [method, setMethod]     = useState("cash");
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const balance = Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0));
  const currency = invoice.currency === "INR" ? "₹" : invoice.currency;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Please enter a valid positive amount."); return; }
    if (amt > balance + 0.01) { setError(`Amount exceeds the balance due (${currency}${balance.toLocaleString()}).`); return; }

    try {
      setSaving(true);
      setError("");
      await onSave({ amount: amt, method, notes });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  };

  const newBalance = Math.max(0, balance - (parseFloat(amount) || 0));

  return (
    <div className="pm-overlay">
      <div className="pm-modal">
        {/* Header */}
        <div className="pm-header">
          <div>
            <h3>Record Payment</h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "2px 0 0" }}>
              {invoice.invoice_number} · {(invoice.recipient_details || {}).name || ""}
            </p>
          </div>
          <button className="pm-close-btn" onClick={onClose} type="button"><FiX /></button>
        </div>

        {/* Balance info */}
        <div className="pm-balance-bar">
          <div className="pm-balance-item">
            <span>Total</span>
            <strong>{currency}{(invoice.total_amount || 0).toLocaleString()}</strong>
          </div>
          <div className="pm-balance-item">
            <span>Paid</span>
            <strong style={{ color: "#16a34a" }}>{currency}{(invoice.paid_amount || 0).toLocaleString()}</strong>
          </div>
          <div className="pm-balance-item">
            <span>Balance Due</span>
            <strong style={{ color: "#dc2626" }}>{currency}{balance.toLocaleString()}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="pm-form">
          {error && <div className="pm-error">⚠ {error}</div>}

          <label className="pm-label">
            <span>Amount Received *</span>
            <div className="pm-input-prefix-wrap">
              <span className="pm-prefix">{currency}</span>
              <input
                id="pm-amount"
                type="number"
                className="pm-input pm-input-has-prefix"
                placeholder={`Max: ${balance.toLocaleString()}`}
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(""); }}
                required
              />
            </div>
          </label>

          <label className="pm-label">
            <span>Payment Method</span>
            <select
              id="pm-method"
              className="pm-input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>

          <label className="pm-label">
            <span>Notes (optional)</span>
            <input
              type="text"
              className="pm-input"
              placeholder="e.g. NEFT ref #123"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {amount && (
            <div className={`pm-preview ${newBalance <= 0 ? "pm-preview-paid" : "pm-preview-partial"}`}>
              {newBalance <= 0
                ? <><FiCheck /> This payment will fully settle the invoice!</>
                : <>New balance after payment: <strong>{currency}{newBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></>
              }
            </div>
          )}

          <div className="pm-footer">
            <button type="button" className="pm-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="pm-btn-save" disabled={saving}>
              {saving ? "Saving..." : "Save Payment"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .pm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;}
        .pm-modal{background:#fff;border-radius:16px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.2);overflow:hidden;}
        .pm-header{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 24px 0;} .pm-header h3{margin:0;font-size:18px;color:#0f172a;}
        .pm-close-btn{background:none;border:none;cursor:pointer;color:#64748b;font-size:20px;padding:4px;line-height:1;border-radius:6px;}
        .pm-close-btn:hover{background:#f1f5f9;}
        .pm-balance-bar{display:flex;gap:0;margin:16px 24px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;}
        .pm-balance-item{flex:1;padding:12px;text-align:center;border-right:1px solid #e2e8f0;}
        .pm-balance-item:last-child{border-right:none;}
        .pm-balance-item span{display:block;font-size:11px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;}
        .pm-balance-item strong{font-size:14px;color:#0f172a;}
        .pm-form{padding:0 24px 24px;display:flex;flex-direction:column;gap:14px;margin-top:8px;}
        .pm-error{background:#fee2e2;color:#b91c1c;border-radius:8px;padding:10px 14px;font-size:13px;}
        .pm-label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#374151;}
        .pm-input{border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px;color:#0f172a;outline:none;width:100%;box-sizing:border-box;transition:border .2s;}
        .pm-input:focus{border-color:#2563eb;}
        .pm-input-prefix-wrap{position:relative;}
        .pm-prefix{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#475569;font-size:14px;pointer-events:none;}
        .pm-input-has-prefix{padding-left:28px;}
        .pm-preview{border-radius:8px;padding:10px 14px;font-size:13px;display:flex;align-items:center;gap:6px;}
        .pm-preview-paid{background:#dcfce7;color:#15803d;}
        .pm-preview-partial{background:#eff6ff;color:#1d4ed8;}
        .pm-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:4px;}
        .pm-btn-cancel{background:#f1f5f9;color:#475569;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;}
        .pm-btn-cancel:hover{background:#e2e8f0;}
        .pm-btn-save{background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;}
        .pm-btn-save:hover:not(:disabled){background:#1d4ed8;}
        .pm-btn-save:disabled{opacity:.6;cursor:not-allowed;}
      `}</style>
    </div>
  );
}

export default PaymentModal;
