import React from "react";

/**
 * AttachmentsBadge shows a small badge with the count of attachments.
 * Props:
 * - count: number
 * - onClick: function to open attachments UI
 */
// PUBLIC_INTERFACE
export default function AttachmentsBadge({ count = 0, onClick }) {
  /** Renders a clickable badge indicating number of attachments on a task. */
  if (!count || count <= 0) return null;
  return (
    <button
      className="attachments-badge"
      onClick={onClick}
      aria-label={`Open attachments (${count})`}
      title={`${count} attachment${count === 1 ? "" : "s"}`}
    >
      📎 {count}
    </button>
  );
}
