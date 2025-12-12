import React from "react";

/**
 * Small badge decoration with ocean/amber accents.
 * Props:
 * - label: string
 * - value: string | number
 * - tone: "primary" | "amber" | "muted"
 */
// PUBLIC_INTERFACE
export default function StatsBadge({ label, value, tone = "primary" }) {
  /** Renders a compact badge with label and value. */
  return (
    <span className={`stats-badge ${tone}`}>
      <span className="stats-badge-label">{label}</span>
      <span className="stats-badge-value">{value}</span>
    </span>
  );
}
