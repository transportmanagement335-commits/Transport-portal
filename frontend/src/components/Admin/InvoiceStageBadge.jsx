/**
 * InvoiceStageBadge — shows whether an invoice is Final, Proforma, or Advance.
 * Props:
 *   stage: "final" | "proforma" | "advance"
 *   size:  "sm" (default) | "lg"
 */
const STAGE_CONFIG = {
  final:    { label: "Final",    bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" },
  proforma: { label: "Proforma", bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
  advance:  { label: "Advance",  bg: "#ede9fe", color: "#5b21b6", border: "#ddd6fe" },
};

function InvoiceStageBadge({ stage = "final", size = "sm" }) {
  const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.final;
  const isLarge = size === "lg";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: isLarge ? "4px 12px" : "2px 8px",
        fontSize: isLarge ? 13 : 11,
        fontWeight: 600,
        borderRadius: 20,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {stage === "final"    && "✓ "}
      {stage === "proforma" && "⏳ "}
      {stage === "advance"  && "⬆ "}
      {cfg.label}
    </span>
  );
}

export default InvoiceStageBadge;
