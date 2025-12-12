import React from "react";

/**
 * EmptyState shows a friendly empty message with optional icon and action.
 * Variants:
 * - full: for main views, larger card, centered
 * - compact: for panels/inline, smaller and subtle
 */

// PUBLIC_INTERFACE
export default function EmptyState({
  title,
  subtitle,
  icon = "🌊",
  actionLabel,
  onAction,
  variant = "full",
  "aria-live": ariaLive = "polite",
}) {
  /** Accessible empty state with Ocean Professional styling. */
  const isCompact = variant === "compact";
  return (
    <div
      className={`empty-state ${isCompact ? "compact" : "full"}`}
      role="status"
      aria-live={ariaLive}
    >
      <div className="empty-state-card">
        {icon ? (
          <div className="empty-state-icon" aria-hidden="true" title="Empty">
            {icon}
          </div>
        ) : null}
        <div className="empty-state-title">{title}</div>
        {subtitle ? <div className="empty-state-sub">{subtitle}</div> : null}
        {actionLabel && typeof onAction === "function" ? (
          <button
            className="btn btn-small empty-state-action"
            onClick={onAction}
            aria-label={actionLabel}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
