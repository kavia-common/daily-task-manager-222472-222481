import React, { useMemo } from "react";

/**
 * DayTimeline renders a vertical 24h timeline (00:00–24:00) with 30-min grid lines.
 * It positions task blocks based on startTime/endTime for the selected day.
 *
 * Props:
 * - date: Date for the day being displayed
 * - tasks: array of normalized tasks { id, title, startTime, endTime, category, priority, pinned }
 * - onSelectTask(id): function invoked when a block is clicked
 * - conflictIds: Set or array of taskIds that have overlaps
 */
// PUBLIC_INTERFACE
export default function DayTimeline({ date, tasks, onSelectTask, conflictIds }) {
  /** Accessible vertical timeline with Ocean Professional theme styling. */
  const selectedKey = useMemo(() => toKey(date), [date]);
  const conflicts = useMemo(() => {
    const set = new Set(Array.isArray(conflictIds) ? conflictIds : []);
    return set;
  }, [conflictIds]);

  const timelineTasks = useMemo(() => {
    // only blocks for the selected date and with valid time ranges
    const list = Array.isArray(tasks) ? tasks : [];
    return list
      .filter((t) => {
        if (!t.startTime || !t.endTime) return false;
        const st = new Date(t.startTime);
        const key = toKey(st);
        return key === selectedKey;
      })
      .map((t) => ({
        ...t,
        // helpers for layout
        startMinutes: minutesFromStartOfDay(new Date(t.startTime)),
        endMinutes: minutesFromStartOfDay(new Date(t.endTime)),
      }))
      .sort((a, b) => {
        // pinned tasks still respect time order; pinned changes z-index and accent
        const ta = a.startMinutes - b.startMinutes;
        if (ta !== 0) return ta;
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        return bp - ap;
      });
  }, [tasks, selectedKey]);

  return (
    <div className="timeline-container">
      <div
        className="timeline"
        role="grid"
        aria-label={`Timeline for ${date.toDateString()}`}
      >
        {Array.from({ length: 25 }).map((_, i) => {
          // hour labels 0..24
          const label = String(i).padStart(2, "0") + ":00";
          return (
            <div
              key={`line-${i}`}
              className="timeline-row"
              role="row"
              aria-label={`time ${label}`}
              style={{ top: `${(i / 24) * 100}%` }}
            >
              <div className="timeline-label" aria-hidden="true">
                {label}
              </div>
              <div className="timeline-line" />
            </div>
          );
        })}
        {/* 30-minute minor lines */}
        {Array.from({ length: 24 }).map((_, i) => {
          const top = ((i + 0.5) / 24) * 100;
          return (
            <div
              key={`half-${i}`}
              className="timeline-half"
              aria-hidden="true"
              style={{ top: `${top}%` }}
            />
          );
        })}

        <div className="timeline-blocks" aria-label="Scheduled tasks" role="region">
          {timelineTasks.map((t) => {
            const top = (t.startMinutes / (24 * 60)) * 100;
            const height = Math.max(2, ((t.endMinutes - t.startMinutes) / (24 * 60)) * 100);
            const categoryClass = `cat-${t.category || "work"}`;
            const pri = t.priority || "medium";
            const conflicted = conflicts.has(t.id);
            return (
              <button
                key={t.id}
                className={`timeline-block ${categoryClass} pri-${pri} ${t.pinned ? "pinned" : ""} ${conflicted ? "conflict" : ""}`}
                style={{ top: `${top}%`, height: `${height}%` }}
                onClick={() => onSelectTask && onSelectTask(t.id)}
                title={`${t.title}\n${formatTimeRange(t.startTime, t.endTime)}\n${t.category || "work"} • ${pri}${t.pinned ? " • ⭐ pinned" : ""}${conflicted ? " • ⚠️ overlapping" : ""}`}
                role="button"
                aria-label={`${t.title}, ${formatTimeRange(t.startTime, t.endTime)}, ${t.category || "work"}, ${pri}${conflicted ? ", overlapping" : ""}`}
              >
                <div className="timeline-block-header">
                  <span className="timeline-block-time">{formatTimeRange(t.startTime, t.endTime)}</span>
                  {conflicted && <span className="timeline-conflict-icon" aria-hidden="true" title="Overlapping time">⚠️</span>}
                </div>
                <div className="timeline-block-title">{t.title}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function minutesFromStartOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

function formatTimeRange(startIso, endIso) {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const sh = String(s.getHours()).padStart(2, "0");
    const sm = String(s.getMinutes()).padStart(2, "0");
    const eh = String(e.getHours()).padStart(2, "0");
    const em = String(e.getMinutes()).padStart(2, "0");
    return `${sh}:${sm}–${eh}:${em}`;
  } catch {
    return "";
  }
}
