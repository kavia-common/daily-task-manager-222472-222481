import React, { useEffect } from "react";

const ALL_BADGES = [
  { id: "First Steps", desc: "Complete your first task." },
  { id: "Consistency", desc: "Complete tasks 7 days in a row." },
  { id: "Power Week", desc: "Complete 25 tasks in a week." },
  { id: "Deadline Hero", desc: "Complete 10 tasks before due time." },
  { id: "Planner", desc: "Create 10 time-blocked tasks." },
  { id: "Collaborator", desc: "Assign/share 5 tasks." },
  { id: "Focus Master", desc: "Complete 5 tasks with no notes/attachments/dependencies." },
  { id: "Unblocker", desc: "Complete 10 previously blocked tasks." },
];

// PUBLIC_INTERFACE
export default function BadgesPanel({ open, onClose, earned = [], history = [] }) {
  /** Modal panel listing earned and locked badges with descriptions. */
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && open) onClose && onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = new Set(earned || []);
  const earnedList = ALL_BADGES.filter(b => set.has(b.id));
  const lockedList = ALL_BADGES.filter(b => !set.has(b.id));

  const earnedDates = {};
  // derive earned dates from history entries mentioning "You earned: Badge" is not stored; we skip dates or use lastEarnedAt
  // In this MVP, we use lastEarnedAt as generic earned timestamp.
  // Optionally could parse history, but kept simple.

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Badges panel">
      <div className="modal-card badges-panel">
        <div className="badges-header">
          <div className="badges-title">Your Badges</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close badges panel">✖️</button>
        </div>
        <div className="badges-grid" role="list" aria-label="Earned badges">
          {earnedList.length === 0 ? <div className="badges-empty">No badges yet — keep going!</div> : earnedList.map(b => (
            <div key={b.id} className="badge-card earned" role="listitem" title={b.desc}>
              <div className="badge-name">🏅 {b.id}</div>
              <div className="badge-desc">{b.desc}</div>
            </div>
          ))}
        </div>
        <div className="badges-subtitle">Locked</div>
        <div className="badges-grid locked" role="list" aria-label="Locked badges">
          {lockedList.map(b => (
            <div key={b.id} className="badge-card locked" role="listitem" aria-disabled="true" title={b.desc}>
              <div className="badge-name">{b.id}</div>
              <div className="badge-desc">{b.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
