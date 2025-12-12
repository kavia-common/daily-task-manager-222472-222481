import React, { useMemo } from "react";

/**
 * Weekly summary of last 7 days using simple CSS bars.
 * Props:
 * - days: Array<{ date: Date, key: string, created: number, completed: number, rate: number }>
 */
// PUBLIC_INTERFACE
export default function WeeklySummary({ days }) {
  /** Displays 7-day created/completed bars and completion rate. */
  const rangeLabel = useMemo(() => {
    if (!days || days.length === 0) return "";
    const start = days[0].date;
    const end = days[days.length - 1].date;
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }, [days]);

  const maxCount = Math.max(1, ...days.map(d => Math.max(d.created, d.completed)));

  return (
    <div className="weekly-summary" role="region" aria-label="Weekly summary">
      <div className="weekly-header">
        <div className="weekly-title">Last 7 Days</div>
        <div className="weekly-range">{rangeLabel}</div>
      </div>
      <div className="weekly-bars">
        {days.map((d) => {
          const createdPct = Math.round((d.created / maxCount) * 100);
          const completedPct = Math.round((d.completed / maxCount) * 100);
          const dayLabel = d.date.toLocaleDateString(undefined, { weekday: "short" });
          return (
            <div className="weekly-day" key={d.key} title={`${d.key}\nCreated: ${d.created}\nCompleted: ${d.completed}\nRate: ${Math.round(d.rate*100)}%`}>
              <div className="weekly-day-label">{dayLabel}</div>
              <div className="weekly-day-bars">
                <div className="bar created" style={{ height: `${createdPct}%` }} aria-label={`Created ${d.created}`} />
                <div className="bar completed" style={{ height: `${completedPct}%` }} aria-label={`Completed ${d.completed}`} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="weekly-legend">
        <span className="legend created">Created</span>
        <span className="legend completed">Completed</span>
      </div>
    </div>
  );
}
