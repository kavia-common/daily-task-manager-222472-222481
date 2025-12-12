import React, { useEffect, useMemo, useState } from "react";

// PUBLIC_INTERFACE
export default function HistoryView({
  todos,
  getCompletedTasks,
  getCompletedTasksByDateRange,
  normalizeDateRange,
  onRestore,
  includeArchived = false,
  onToggleIncludeArchived,
  gamification,
}) {
  /** History view showing completed tasks with date range, quick presets, search, and restore action. */
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("last7");
  const [q, setQ] = useState("");

  // presets: today, last7, thisMonth, last30, all
  useEffect(() => {
    const now = new Date();
    const toISODate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    if (preset === "today") {
      setFrom(toISODate(now));
      setTo(toISODate(now));
    } else if (preset === "last7") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      setFrom(toISODate(start));
      setTo(toISODate(now));
    } else if (preset === "thisMonth") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(toISODate(start));
      setTo(toISODate(now));
    } else if (preset === "last30") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      setFrom(toISODate(start));
      setTo(toISODate(now));
    } else if (preset === "all") {
      setFrom("");
      setTo("");
    }
  }, [preset]);

  const range = useMemo(() => normalizeDateRange(from || null, to || null), [from, to, normalizeDateRange]);

  const baseList = useMemo(() => {
    if (!from && !to) {
      // No range specified: show all completed
      const all = getCompletedTasks();
      return includeArchived ? all : all.filter((t) => !t.archived);
    }
    const list = getCompletedTasksByDateRange(range.startISO, range.endISO);
    return includeArchived ? list : list.filter((t) => !t.archived);
  }, [from, to, includeArchived, getCompletedTasks, getCompletedTasksByDateRange, range]);

  const filtered = useMemo(() => {
    if (!q) return baseList;
    const needle = q.toLowerCase();
    return baseList.filter((t) => String(t.title || t.text || "").toLowerCase().includes(needle));
  }, [q, baseList]);

  const pointsByTaskId = useMemo(() => {
    // Best-effort per-task last award display if gamification history exists
    const hist = (gamification && Array.isArray(gamification.history) ? gamification.history : []);
    const map = {};
    for (const h of hist) {
      if (!h || !h.taskId) continue;
      // keep the most recent entry per taskId
      if (!map[h.taskId]) map[h.taskId] = h;
      else {
        const prev = map[h.taskId];
        const prevAt = new Date(prev.at || 0).getTime();
        const curAt = new Date(h.at || 0).getTime();
        if (curAt >= prevAt) map[h.taskId] = h;
      }
    }
    return map;
  }, [gamification]);

  return (
    <div className="history-view" role="region" aria-label="Task history">
      <div className="history-filters" role="group" aria-label="History filters">
        <div className="filter-group">
          <label htmlFor="hist-from" className="filter-label">From</label>
          <input
            id="hist-from"
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="History from date"
            style={{ maxWidth: 180 }}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="hist-to" className="filter-label">To</label>
          <input
            id="hist-to"
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="History to date"
            style={{ maxWidth: 180 }}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="hist-preset" className="filter-label">Quick presets</label>
          <select
            id="hist-preset"
            className="select"
            aria-label="Quick date presets"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="last7">Last 7 days</option>
            <option value="thisMonth">This Month</option>
            <option value="last30">Last 30 days</option>
            <option value="all">All Time</option>
          </select>
        </div>
        <div className="filter-group" style={{ alignSelf: "center" }}>
          <label className="sr-only" htmlFor="hist-q">Search completed tasks</label>
          <input
            id="hist-q"
            className="input"
            type="text"
            placeholder="Search title..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search completed tasks by title"
            style={{ maxWidth: 240 }}
          />
        </div>
        <div className="filter-group" style={{ alignSelf: "center" }}>
          <button
            className={`chip ${includeArchived ? "chip-selected" : ""}`}
            aria-pressed={includeArchived}
            onClick={() => onToggleIncludeArchived && onToggleIncludeArchived(!includeArchived)}
            title="Include archived items"
          >
            Include archived
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="history-empty">
          <div className="history-empty-title">No matching completed tasks</div>
          <div className="history-empty-sub">Try adjusting the date range, searching different terms, or include archived.</div>
        </div>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table" aria-label="Completed tasks">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Completed At</th>
                <th scope="col">Category</th>
                <th scope="col">Priority</th>
                <th scope="col">Assignees</th>
                {gamification ? <th scope="col">Points</th> : null}
                <th scope="col" style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const completedAt = t.completedAt ? new Date(t.completedAt) : null;
                const pts = pointsByTaskId[t.id]?.delta ?? null;
                const assignees = Array.isArray(t.assignees) ? t.assignees : [];
                return (
                  <tr key={t.id} className={t.archived ? "archived-row" : ""}>
                    <td>
                      <div className="hist-title">{t.title || t.text}</div>
                    </td>
                    <td>{completedAt ? completedAt.toLocaleString() : "-"}</td>
                    <td>
                      <span className={`chip chip-cat ${t.category || "work"}`}>{t.category || "work"}</span>
                    </td>
                    <td>
                      <span className={`chip chip-pri ${t.priority || "medium"}`}>{t.priority || "medium"}</span>
                    </td>
                    <td>
                      <div className="hist-assignees">
                        {assignees.length === 0 ? <span className="muted">—</span> : assignees.map((u) => (
                          <span key={u} className="avatar" title={u} aria-label={`Assignee ${u}`}>
                            {String(u).split("@")[0].split(".").map(p => p[0]).join("").slice(0,2).toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    {gamification ? (
                      <td>
                        {pts == null ? <span className="muted">—</span> : <span className="stats-badge amber"><span className="stats-badge-label">Δ</span><span className="stats-badge-value">{pts}</span></span>}
                      </td>
                    ) : null}
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-small"
                        onClick={() => onRestore(t.id)}
                        aria-label={`Restore ${t.title || t.text}`}
                        title="Restore to active"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
