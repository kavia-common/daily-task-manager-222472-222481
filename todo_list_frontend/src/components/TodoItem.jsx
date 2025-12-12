import { useEffect, useRef, useState } from "react";

/**
 * Renders a single todo item with checkbox toggle, inline edit, and delete.
 * Props:
 * - todo: { id, title, completed, category?, priority? }
 * - onToggle(id)
 * - onDelete(id)
 * - onUpdate(id, updates)
 */

// PUBLIC_INTERFACE
export default function TodoItem({ todo, onToggle, onDelete, onUpdate }) {
  /** Todo item component with inline editing support. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [catDraft, setCatDraft] = useState(todo.category || "work");
  const [priDraft, setPriDraft] = useState(todo.priority || "medium");
  const inputRef = useRef(null);

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
  }, [todo.title, todo.category, todo.priority]);

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

    if (Object.keys(updates).length > 0) {
      onUpdate(todo.id, updates);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(todo.title);
    setCatDraft(todo.category || "work");
    setPriDraft(todo.priority || "medium");
    setEditing(false);
  };

  const category = todo.category || "work";
  const priority = todo.priority || "medium";

  return (
    <div className="item" role="listitem">
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
            <div style={{ display: "flex", gap: 8 }}>
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
