import React, { useMemo, useState } from "react";

/**
 * DependencySelector allows selecting multiple prerequisite tasks for a given task.
 * Excludes the task itself and prevents cycles via provided detectCycle.
 *
 * Props:
 * - tasks: array of all tasks
 * - value: string[] of selected dependency task IDs
 * - onChange(nextIds: string[]): void
 * - taskId: string (the current task id; can be null/undefined in creation mode)
 * - detectCycle(taskId, depIds, list?): function => boolean
 * - ariaLabel?: string
 */

// PUBLIC_INTERFACE
export default function DependencySelector({
  tasks,
  value,
  onChange,
  taskId,
  detectCycle,
  ariaLabel = "Select dependencies",
}) {
  /** Searchable multi-select for dependencies with chip UI and keyboard support. */
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const all = Array.isArray(tasks) ? tasks : [];
    const valSet = new Set((Array.isArray(value) ? value : []).map(String));
    return all
      .filter((t) => {
        if (taskId && t.id === taskId) return false; // exclude self
        if (valSet.has(t.id)) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return t.title.toLowerCase().includes(q);
      })
      .slice(0, 50);
  }, [tasks, value, query, taskId]);

  const selected = useMemo(() => {
    const set = new Set((Array.isArray(value) ? value : []).map(String));
    const all = Array.isArray(tasks) ? tasks : [];
    return all.filter((t) => set.has(t.id));
  }, [tasks, value]);

  function addId(id) {
    const current = Array.isArray(value) ? value.map(String) : [];
    const next = Array.from(new Set([...current, String(id)]));
    if (taskId && typeof detectCycle === "function" && detectCycle(taskId, next, tasks)) {
      // non-blocking message via title/aria; upstream can toast
      return;
    }
    onChange(next);
    setQuery("");
  }

  function removeId(id) {
    const current = Array.isArray(value) ? value.map(String) : [];
    const next = current.filter((d) => d !== String(id));
    onChange(next);
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && options[0]) {
      addId(options[0].id);
      e.preventDefault();
    }
    if (e.key === "Backspace" && !query && selected.length > 0) {
      removeId(selected[selected.length - 1].id);
      e.preventDefault();
    }
  };

  return (
    <div className="dep-selector" role="group" aria-label={ariaLabel}>
      <div className="dep-chips" aria-label="Selected dependencies">
        {selected.map((t) => (
          <span key={t.id} className="dep-chip" aria-label={`Depends on ${t.title}`}>
            <span className="dep-chip-title">{t.title}</span>
            <button
              className="dep-chip-remove"
              aria-label={`Remove dependency ${t.title}`}
              onClick={() => removeId(t.id)}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="dep-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search tasks to add as dependencies"
          placeholder="Search tasks…"
        />
      </div>
      {options.length > 0 && (
        <ul className="dep-options" role="listbox" aria-label="Dependency options">
          {options.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="dep-option"
                onClick={() => addId(t.id)}
                aria-label={`Add dependency ${t.title}`}
                title="Add dependency"
              >
                <span className={`dep-option-status ${t.completed ? "done" : "pending"}`} aria-hidden="true">
                  {t.completed ? "✓" : "○"}
                </span>
                <span className="dep-option-title">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
