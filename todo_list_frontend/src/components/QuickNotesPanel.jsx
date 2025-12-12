import React, { useMemo, useState } from "react";

/**
 * QuickNotesPanel renders a global notes panel with both plain and checklist notes.
 * Props:
 * - notes: array of notes
 * - addQuickNote(note)
 * - updateQuickNote(id, patch)
 * - deleteQuickNote(id)
 * - addQuickChecklistItem(noteId, text)
 * - toggleQuickChecklistItem(noteId, itemId)
 * - deleteQuickChecklistItem(noteId, itemId)
 */
// PUBLIC_INTERFACE
export default function QuickNotesPanel({
  notes,
  addQuickNote,
  updateQuickNote,
  deleteQuickNote,
  addQuickChecklistItem,
  toggleQuickChecklistItem,
  deleteQuickChecklistItem
}) {
  /** Side/top panel for quick notes with Ocean theme accents. */
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState("plain");
  const [newText, setNewText] = useState("");
  const [newChecklist, setNewChecklist] = useState("");

  const sorted = useMemo(() => {
    const arr = Array.isArray(notes) ? [...notes] : [];
    return arr.sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt).getTime();
      const bt = new Date(b.updatedAt || b.createdAt).getTime();
      return bt - at;
    });
  }, [notes]);

  const createPlain = () => {
    const text = String(newText || "").trim();
    if (!text) return;
    const now = new Date().toISOString();
    addQuickNote({
      id: `q_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      text,
      createdAt: now,
      updatedAt: now,
      checklist: false,
      items: [],
    });
    setNewText("");
  };

  const createChecklist = () => {
    const title = String(newChecklist || "").trim();
    if (!title) return;
    const now = new Date().toISOString();
    addQuickNote({
      id: `q_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      text: title,
      createdAt: now,
      updatedAt: now,
      checklist: true,
      items: [],
    });
    setNewChecklist("");
  };

  const addItem = (noteId, inputId) => {
    const el = document.getElementById(inputId);
    const text = String(el?.value || "").trim();
    if (!text) return;
    addQuickChecklistItem(noteId, text);
    if (el) el.value = "";
  };

  return (
    <section className="quick-notes" aria-label="Quick notes panel">
      <header className="quick-notes-header">
        <div className="quick-notes-title">Quick Notes</div>
        <button
          className="icon-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}
          aria-label={expanded ? "Collapse quick notes" : "Expand quick notes"}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </header>
      {expanded && (
        <div className="quick-notes-body">
          <div className="note-new">
            <div className="note-toolbar" role="tablist" aria-label="New quick note type">
              <button
                role="tab"
                aria-selected={mode === "plain"}
                className={`chip ${mode === "plain" ? "chip-selected" : ""}`}
                onClick={() => setMode("plain")}
              >
                ✍️ Note
              </button>
              <button
                role="tab"
                aria-selected={mode === "checklist"}
                className={`chip ${mode === "checklist" ? "chip-selected" : ""}`}
                onClick={() => setMode("checklist")}
              >
                ✅ Checklist
              </button>
            </div>

            {mode === "plain" ? (
              <div className="note-card">
                <label className="sr-only" htmlFor="quick-new-plain">New quick note</label>
                <textarea
                  id="quick-new-plain"
                  className="note-textarea"
                  placeholder="Write a quick note..."
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  aria-label="Quick note content"
                />
                <div className="note-actions">
                  <button className="btn btn-small" onClick={createPlain} aria-label="Add quick note">Add</button>
                </div>
              </div>
            ) : (
              <div className="note-card">
                <label className="sr-only" htmlFor="quick-new-check">New quick checklist title</label>
                <input
                  id="quick-new-check"
                  className="inline-input"
                  placeholder="Checklist title..."
                  value={newChecklist}
                  onChange={(e) => setNewChecklist(e.target.value)}
                  aria-label="Quick checklist title"
                />
                <div className="note-actions">
                  <button className="btn btn-small" onClick={createChecklist} aria-label="Add quick checklist">Add</button>
                </div>
              </div>
            )}
          </div>

          <div className="notes-list">
            {sorted.length === 0 ? (
              <div className="empty">No quick notes.</div>
            ) : sorted.map(n => (
              <div className="note-card" key={n.id}>
                <div className="note-card-head">
                  <input
                    className="inline-input"
                    aria-label="Quick note title"
                    value={n.text}
                    onChange={(e) => updateQuickNote(n.id, { text: e.target.value, updatedAt: new Date().toISOString() })}
                  />
                  <div className="note-card-tools">
                    <span className={`chip ${n.checklist ? "chip-repeat" : "chip-due"}`}>
                      {n.checklist ? "✅" : "✍️"}
                    </span>
                    <button
                      className="icon-btn danger"
                      onClick={() => deleteQuickNote(n.id)}
                      aria-label="Delete quick note"
                      title="Delete note"
                    >🗑️</button>
                  </div>
                </div>
                {n.checklist ? (
                  <div className="checklist">
                    <ul className="checklist-items" role="list" aria-label="Quick checklist items">
                      {(n.items || []).map(it => (
                        <li key={it.id} className={`checklist-item ${it.done ? "done" : ""}`} role="listitem">
                          <label className="checklist-label">
                            <input
                              type="checkbox"
                              checked={!!it.done}
                              onChange={() => toggleQuickChecklistItem(n.id, it.id)}
                              aria-checked={!!it.done}
                            />
                            <span className="checklist-text">{it.text}</span>
                          </label>
                          <button
                            className="icon-btn"
                            onClick={() => deleteQuickChecklistItem(n.id, it.id)}
                            aria-label="Delete quick checklist item"
                            title="Delete item"
                          >✖️</button>
                        </li>
                      ))}
                    </ul>
                    <div className="checklist-add">
                      <label className="sr-only" htmlFor={`quick-add-${n.id}`}>Add quick checklist item</label>
                      <input
                        id={`quick-add-${n.id}`}
                        className="inline-input"
                        placeholder="Add item..."
                        aria-label="New quick checklist item"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addItem(n.id, `quick-add-${n.id}`);
                        }}
                      />
                      <button className="btn btn-small" onClick={() => addItem(n.id, `quick-add-${n.id}`)} aria-label="Add item">Add</button>
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="note-textarea"
                    aria-label="Quick note body"
                    placeholder="Details..."
                    value={n.body || ""}
                    onChange={(e) => updateQuickNote(n.id, { body: e.target.value, updatedAt: new Date().toISOString() })}
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
      )}
    </section>
  );
}
