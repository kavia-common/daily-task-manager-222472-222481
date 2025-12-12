import React, { useState } from "react";
import TodoList from "./TodoList";

/**
 * Daily view showing tasks due today or created today, with a quick add.
 * Props:
 * - todaysTodos: array
 * - todayTotals: { total, completed, rate }
 * - onAdd: function(title: string)
 * - onToggle, onDelete, onUpdate: handlers forwarded to TodoList
 */
// PUBLIC_INTERFACE
export default function DailyView({ todaysTodos, todayTotals, onAdd, onToggle, onDelete, onUpdate }) {
  /** Shows today's tasks and a small progress indicator with quick add. */
  const [quick, setQuick] = useState("");

  const pct = Math.round((todayTotals?.rate || 0) * 100);

  const submit = () => {
    const v = String(quick || "").trim();
    if (!v) return;
    onAdd(v); // defaults applied in hook
    setQuick("");
  };

  return (
    <div className="daily-view">
      <div className="daily-toolbar">
        <div className="daily-progress">
          <div className="daily-progress-bar">
            <div className="daily-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="daily-progress-meta">{Math.round(todayTotals.rate * 100)}% today</div>
        </div>
        <div className="daily-quickadd" role="form" aria-label="Quick add for today">
          <input
            className="input"
            placeholder="Quick add for today..."
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" ? submit() : null}
            aria-label="Quick add task"
          />
          <button className="btn btn-small" onClick={submit} aria-label="Add quick task">Add</button>
        </div>
      </div>

      <TodoList
        todos={todaysTodos}
        onToggle={onToggle}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />
    </div>
  );
}
