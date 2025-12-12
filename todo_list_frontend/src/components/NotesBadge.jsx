import React from "react";

/**
 * NotesBadge shows a small badge with the count of notes attached to a task.
 * Props:
 * - count: number
 * - onClick: function to open notes UI
 */
// PUBLIC_INTERFACE
export default function NotesBadge({ count = 0, onClick }) {
  /** Renders a clickable badge indicating number of notes on a task. */
  if (!count || count <= 0) return null;
  return (
    <button
      className="notes-badge"
      onClick={onClick}
      aria-label={`Open notes (${count})`}
      title={`${count} note${count === 1 ? "" : "s"}`}
    >
      📝 {count}
    </button>
  );
}
