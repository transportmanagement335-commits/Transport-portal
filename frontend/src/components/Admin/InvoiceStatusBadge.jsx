/**
 * InvoiceStatusBadge — color-coded badge for invoice status values.
 */
const STATUS_CONFIG = {
  draft:     { label: "Draft",     bg: "#f1f5f9", color: "#475569" },
  sent:      { label: "Sent",      bg: "#dbeafe", color: "#1d4ed8" },
  viewed:    { label: "Viewed",    bg: "#ede9fe", color: "#7c3aed" },
  paid:      { label: "Paid",      bg: "#dcfce7", color: "#15803d" },
  partial:   { label: "Partial",   bg: "#fef3c7", color: "#b45309" },
  overdue:   { label: "Overdue",   bg: "#fee2e2", color: "#b91c1c" },
  cancelled: { label: "Cancelled", bg: "#f3f4f6", color: "#6b7280" },
};

function InvoiceStatusBadge({ status, size = "sm" }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG.draft;
  const fontSize = size === "lg" ? "13px" : "11px";
  const padding  = size === "lg" ? "5px 14px" : "3px 10px";

  return (
    <span
      style={{
        display: "inline-block",
        background: cfg.bg,
        color: cfg.color,
        borderRadius: "20px",
        fontSize,
        fontWeight: 600,
        padding,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

export default InvoiceStatusBadge;
