/**
 * WhatsAppSendButton — sends an invoice via WhatsApp Business API.
 *
 * Props:
 *   invoiceId  : string  — the invoice document _id
 *   onSuccess  : (updatedInvoice) => void  — called with updated invoice data on success
 *   disabled   : bool    — optional external disabled state
 */
import { useState } from "react";
import { invoicesAPI } from "../../api";

const CHECK = "✓";

function WhatsAppSendButton({ invoiceId, onSuccess, disabled = false }) {
  const [state, setState] = useState("idle"); // "idle" | "loading" | "done" | "error"
  const [errorMsg, setErrorMsg] = useState("");

  async function handleClick() {
    if (state === "loading" || disabled) return;
    setState("loading");
    setErrorMsg("");

    try {
      const result = await invoicesAPI.sendWhatsApp(invoiceId);
      setState("done");
      if (onSuccess && result?.invoice) onSuccess(result.invoice);
      // Auto-reset icon after 3s
      setTimeout(() => setState("idle"), 3000);
    } catch (err) {
      setErrorMsg(err?.message || "WhatsApp send failed");
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  const label = {
    idle:    "📲 Send via WhatsApp",
    loading: "Sending…",
    done:    `${CHECK} Sent!`,
    error:   "✕ Failed",
  }[state];

  const bg = {
    idle:    "#16a34a",
    loading: "#15803d",
    done:    "#15803d",
    error:   "#dc2626",
  }[state];

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={state === "loading" || disabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          background: bg,
          color: "white",
          border: "none",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: state === "loading" || disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "background 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        {state === "loading" && (
          <span
            style={{
              width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)",
              borderTopColor: "white", borderRadius: "50%",
              display: "inline-block", animation: "wa-spin 0.8s linear infinite",
            }}
          />
        )}
        {label}
      </button>

      {state === "error" && errorMsg && (
        <div style={{ fontSize: 11, color: "#dc2626", maxWidth: 200 }}>
          {errorMsg}
        </div>
      )}

      {/* Keyframe injected inline once */}
      <style>{`
        @keyframes wa-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default WhatsAppSendButton;
