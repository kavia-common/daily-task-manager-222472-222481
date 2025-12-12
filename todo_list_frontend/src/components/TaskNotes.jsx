import React, { useMemo, useState, useEffect, useCallback } from "react";
import EmptyState from "./EmptyState";

/**
 * TaskNotes renders an inline editor/viewer for notes belonging to a single task.
 * It supports plain text notes and checklist-style notes with items.
 *
 * Props:
 * - task: object with { id, notes?: [] }
 * - onAddNote(taskId, note)
 * - onUpdateNote(taskId, noteId, patch)
 * - onDeleteNote(taskId, noteId)
 * - onAddChecklistItem(taskId, noteId, itemText)
 * - onToggleChecklistItem(taskId, noteId, itemId)
 * - onDeleteChecklistItem(taskId, noteId, itemId)
 * - onClose(): optional close handler
 */
// PUBLIC_INTERFACE
export default function TaskNotes({
  task,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onClose
}) {
  /** Inline notes editor for a single task with checklist support and a modern ocean theme look. */
  const [newNoteMode, setNewNoteMode] = useState("plain"); // 'plain' | 'checklist'
  const [newText, setNewText] = useState("");
  const [newChecklistText, setNewChecklistText] = useState("");

  const notes = useMemo(() => Array.isArray(task?.notes) ? task.notes : [], [task]);

  const submitNew = () => {
    const text = String(newText || "").trim();
    if (!text) return;
    const now = new Date().toISOString();
    const note = {
      id: `note_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      text,
      createdAt: now,
      updatedAt: now,
      checklist: false,
      items: []
    };
    onAddNote(task.id, note);
    setNewText("");
  };

  const submitNewChecklist = () => {
    const title = String(newChecklistText || "").trim();
    if (!title) return;
    const now = new Date().toISOString();
    const note = {
      id: `note_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      text: title,
      createdAt: now,
      updatedAt: now,
      checklist: true,
      items: []
    };
    onAddNote(task.id, note);
    setNewChecklistText("");
  };

  const addItem = (noteId, inputId) => {
    const el = document.getElementById(inputId);
    const txt = String(el?.value || "").trim();
    if (!txt) return;
    onAddChecklistItem(task.id, noteId, txt);
    if (el) el.value = "";
  };

  const keydownAddItem = (e, noteId, inputId) => {
    if (e.key === "Enter") {
      addItem(noteId, inputId);
    }
  };

  const toggleChecklist = useCallback((noteId, itemId) => {
    onToggleChecklistItem(task.id, noteId, itemId);
  }, [onToggleChecklistItem, task?.id]);

  return (
    <div className="task-notes" role="region" aria-label={`Notes for ${task?.title || "task"}`}>
      <div className="notes-header">
        <div className="notes-title">Notes</div>
        {typeof onClose === "function" && (
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close notes"
            title="Close"
          >✖️</button>
        )}
      </div>

      <div className="note-new">
        <div className="note-toolbar" role="tablist" aria-label="New note type">
          <button
            role="tab"
            aria-selected={newNoteMode === "plain"}
            className={`chip ${newNoteMode === "plain" ? "chip-selected" : ""}`}
            onClick={() => setNewNoteMode("plain")}
            title="Plain note"
          >
            ✍️ Note
          </button>
          <button
            role="tab"
            aria-selected={newNoteMode === "checklist"}
            className={`chip ${newNoteMode === "checklist" ? "chip-selected" : ""}`}
            onClick={() => setNewNoteMode("checklist")}
            title="Checklist note"
          >
            ✅ Checklist
          </button>
        </div>

        {newNoteMode === "plain" ? (
          <div className="note-card">
            <label className="sr-only" htmlFor={`new-note-${task.id}`}>New note</label>
            <textarea
              id={`new-note-${task.id}`}
              className="note-textarea"
              placeholder="Write a note..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              aria-label="New note content"
            />
            <div className="note-actions">
              <button className="btn btn-small" onClick={submitNew} aria-label="Add note">Add Note</button>
            </div>
          </div>
        ) : (
          <div className="note-card">
            <label className="sr-only" htmlFor={`new-checklist-${task.id}`}>New checklist title</label>
            <input
              id={`new-checklist-${task.id}`}
              className="inline-input"
              placeholder="Checklist title..."
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              aria-label="Checklist title"
            />
            <div className="note-actions">
              <button className="btn btn-small" onClick={submitNewChecklist} aria-label="Add checklist">Add Checklist</button>
            </div>
          </div>
        )}
      </div>

      <div className="notes-list">
        {notes.length === 0 ? (
          <EmptyState
            title="No notes yet"
            subtitle="Add a note to keep context and details with this task."
            icon="🗒️"
            variant="compact"
          />
        ) : notes.map((n) => (
          <div className="note-card" key={n.id}>
            <div className="note-card-head">
              <input
                className="inline-input"
                aria-label="Note title"
                value={n.text}
                onChange={(e) => onUpdateNote(task.id, n.id, { text: e.target.value, updatedAt: new Date().toISOString() })}
              />
              <div className="note-card-tools">
                <span className={`chip ${n.checklist ? "chip-repeat" : "chip-due"}`} title={n.checklist ? "Checklist" : "Plain note"}>
                  {n.checklist ? "✅" : "✍️"}
                </span>
                <button
                  className="icon-btn danger"
                  onClick={() => onDeleteNote(task.id, n.id)}
                  aria-label="Delete note"
                  title="Delete note"
                >🗑️</button>
              </div>
            </div>

            {n.checklist ? (
              <div className="checklist">
                <ul className="checklist-items" role="list" aria-label="Checklist items">
                  {(n.items || []).map((it) => (
                    <li key={it.id} className={`checklist-item ${it.done ? "done" : ""}`} role="listitem">
                      <label className="checklist-label">
                        <input
                          type="checkbox"
                          checked={!!it.done}
                          onChange={() => toggleChecklist(n.id, it.id)}
                          aria-checked={!!it.done}
                        />
                        <span className="checklist-text">{it.text}</span>
                      </label>
                      <button
                        className="icon-btn"
                        onClick={() => onDeleteChecklistItem(task.id, n.id, it.id)}
                        aria-label="Delete checklist item"
                        title="Delete item"
                      >✖️</button>
                    </li>
                  ))}
                </ul>
                <div className="checklist-add">
                  <label className="sr-only" htmlFor={`add-item-${n.id}`}>Add checklist item</label>
                  <input
                    id={`add-item-${n.id}`}
                    className="inline-input"
                    placeholder="Add item..."
                    onKeyDown={(e) => keydownAddItem(e, n.id, `add-item-${n.id}`)}
                    aria-label="New checklist item"
                  />
                  <button className="btn btn-small" onClick={() => addItem(n.id, `add-item-${n.id}`)} aria-label="Add item">Add</button>
                </div>
              </div>
            ) : (
              <textarea
                className="note-textarea"
                aria-label="Note body"
                placeholder="Details..."
                value={n.body || ""}
                onChange={(e) => onUpdateNote(task.id, n.id, { body: e.target.value, updatedAt: new Date().toISOString() })}
              />
            )}
            <div className="note-footer">
              <span className="note-date" title={`Updated ${new Date(n.updatedAt || n.createdAt).toLocaleString()}`}>
                {new Date(n.updatedAt || n.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
