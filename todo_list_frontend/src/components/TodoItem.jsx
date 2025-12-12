import { useEffect, useRef, useState } from "react";

/**
 * Renders a single todo item with checkbox toggle, inline edit, and delete.
 * Props:
 * - todo: { id, title, completed, category?, priority?, dueDate?: string|null, repeat?: string, remindAt?: string|null, lastNotifiedAt?: string|null }
 * - onToggle(id)
 * - onDelete(id)
 * - onUpdate(id, updates)
 */

// PUBLIC_INTERFACE
export default function TodoItem({ todo, onToggle, onDelete, onUpdate }) {
  /** Todo item component with inline editing support including due/repeat/remindAt. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [catDraft, setCatDraft] = useState(todo.category || "work");
  const [priDraft, setPriDraft] = useState(todo.priority || "medium");
  const [dueDraft, setDueDraft] = useState(todo.dueDate ? toLocalDateInput(todo.dueDate) : "");
  const [repeatDraft, setRepeatDraft] = useState(todo.repeat || "none");
  const [remindDraft, setRemindDraft] = useState(todo.remindAt || "");
  const inputRef = useRef(null);

  function toLocalDateInput(iso) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(todo.title);
    setCatDraft(todo.category || "work");
    setPriDraft(todo.priority || "medium");
    setDueDraft(todo.dueDate ? toLocalDateInput(todo.dueDate) : "");
    setRepeatDraft(todo.repeat || "none");
    setRemindDraft(todo.remindAt || "");
  }, [todo.title, todo.category, todo.priority, todo.dueDate, todo.repeat, todo.remindAt]);

  const confirmEdit = () => {
    const v = draft.trim();
    if (!v) {
      // if empty on edit confirm, treat as delete
      onDelete(todo.id);
      setEditing(false);
      return;
    }
    const updates = {};
    if (v !== todo.title) updates.title = v;
    if ((todo.category || "work") !== catDraft) updates.category = catDraft;
    if ((todo.priority || "medium") !== priDraft) updates.priority = priDraft;

    // Due/repeat/remind validations
    const reminderAllowed = Boolean(dueDraft) || repeatDraft !== "none";
    const dueISO = dueDraft ? new Date(dueDraft).toISOString() : null;
    const remind = reminderAllowed && remindDraft ? remindDraft : null;

    if ((todo.dueDate || null) !== (dueISO || null)) updates.dueDate = dueISO;
    if ((todo.repeat || "none") !== repeatDraft) updates.repeat = repeatDraft;
    if ((todo.remindAt || null) !== (remind || null)) updates.remindAt = remind;

    if (Object.keys(updates).length > 0) {
      onUpdate(todo.id, updates);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(todo.title);
    setCatDraft(todo.category || "work");
    setPriDraft(todo.priority || "medium");
    setDueDraft(todo.dueDate ? toLocalDateInput(todo.dueDate) : "");
    setRepeatDraft(todo.repeat || "none");
    setRemindDraft(todo.remindAt || "");
    setEditing(false);
  };

  const category = todo.category || "work";
  const priority = todo.priority || "medium";
  const isOverdue = !!todo.dueDate && !todo.completed && new Date() > new Date(todo.dueDate);

  const repeatLabel = (r) => {
    if (!r || r === "none") return null;
    return r;
  };

  return (
    <div className="item" role="listitem" aria-label={`Task ${todo.title}`}>
      <input
        type="checkbox"
        className="checkbox"
        checked={!!todo.completed}
        onChange={() => onToggle(todo.id)}
        aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
      />
      <div style={{ width: "100%" }}>
        {editing ? (
          <div style={{ display: "grid", gap: 8 }}>
            <input
              ref={inputRef}
              className="inline-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              aria-label="Edit task"
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                className="select small"
                aria-label="Edit category"
                value={catDraft}
                onChange={(e) => setCatDraft(e.target.value)}
              >
                <option value="work">Work</option>
                <option value="home">Home</option>
                <option value="study">Study</option>
                <option value="shopping">Shopping</option>
              </select>
              <select
                className="select small"
                aria-label="Edit priority"
                value={priDraft}
                onChange={(e) => setPriDraft(e.target.value)}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <input
                className="inline-input"
                type="date"
                aria-label="Edit due date"
                value={dueDraft}
                onChange={(e) => setDueDraft(e.target.value)}
                style={{ maxWidth: 180 }}
              />
              <select
                className="select small"
                aria-label="Edit repeat"
                value={repeatDraft}
                onChange={(e) => setRepeatDraft(e.target.value)}
              >
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input
                className="inline-input"
                type="time"
                aria-label="Edit reminder time"
                value={remindDraft}
                onChange={(e) => setRemindDraft(e.target.value)}
                disabled={!(Boolean(dueDraft) || repeatDraft !== "none")}
                style={{ maxWidth: 140 }}
              />

              <button className="btn btn-small" onClick={confirmEdit} aria-label="Save edits">Save</button>
              <button className="icon-btn" onClick={cancelEdit} aria-label="Cancel edits" title="Cancel">✖️</button>
            </div>
          </div>
        ) : (
          <div
            className={`title ${todo.completed ? "completed" : ""}`}
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
          >
            {todo.title}
            <div className="meta">
              <span className={`chip chip-cat ${category}`}>{category}</span>
              <span className={`chip chip-pri ${priority}`}>{priority}</span>
              {todo.dueDate ? (
                <span className={`chip ${isOverdue ? "chip-overdue" : "chip-due"}`} title={`Due ${new Date(todo.dueDate).toLocaleString()}`}>
                  {isOverdue ? "Overdue" : "Due"}: {new Date(todo.dueDate).toLocaleDateString()}
                </span>
              ) : null}
              {repeatLabel(todo.repeat) ? (
                <span className="chip chip-repeat" title={`Repeats ${todo.repeat}`}>{repeatLabel(todo.repeat)}</span>
              ) : null}
              {todo.remindAt ? (
                <span className="chip chip-remind" title={`Reminds at ${todo.remindAt}`}>⏰ {todo.remindAt}</span>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <div className="actions" aria-label="Item actions">
        <button
          className="icon-btn"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? "Finish editing" : "Edit task"}
          title={editing ? "Finish editing" : "Edit"}
        >
          ✏️
        </button>
        <button
          className="icon-btn danger"
          onClick={() => onDelete(todo.id)}
          aria-label="Delete task"
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
