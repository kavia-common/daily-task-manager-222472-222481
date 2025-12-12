import { useEffect, useRef, useState } from "react";

/**
 * Renders a single todo item with checkbox toggle, inline edit, and delete.
 * Props:
 * - todo: { id, title, completed }
 * - onToggle(id)
 * - onDelete(id)
 * - onUpdate(id, updates)
 */

// PUBLIC_INTERFACE
export default function TodoItem({ todo, onToggle, onDelete, onUpdate }) {
  /** Todo item component with inline editing support. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(todo.title);
  }, [todo.title]);

  const confirmEdit = () => {
    const v = draft.trim();
    if (!v) {
      // if empty on edit confirm, treat as delete
      onDelete(todo.id);
      setEditing(false);
      return;
    }
    if (v !== todo.title) {
      onUpdate(todo.id, { title: v });
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(todo.title);
    setEditing(false);
  };

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
          <input
            ref={inputRef}
            className="inline-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={confirmEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            aria-label="Edit task"
          />
        ) : (
          <div
            className={`title ${todo.completed ? "completed" : ""}`}
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
          >
            {todo.title}
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
