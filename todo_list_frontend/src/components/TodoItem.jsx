import { useEffect, useRef, useState } from "react";
import TaskNotes from "./TaskNotes";
import NotesBadge from "./NotesBadge";
import AttachmentsBadge from "./AttachmentsBadge";
import TaskAttachments from "./TaskAttachments";
import DependencySelector from "./DependencySelector";
import { useTodos } from "../hooks/useTodos";

/**
 * Renders a single todo item with checkbox toggle, inline edit, delete, per-task notes,
 * time blocking editing, and dependency display/editor.
 * Props:
 * - todo: { id, title, completed, category?, priority?, dueDate?: string|null, repeat?: string, remindAt?: string|null, lastNotifiedAt?: string|null, notes?: [], startTime?: string|null, endTime?: string|null, dependencies?: string[] }
 * - onToggle(id)
 * - onDelete(id)
 * - onUpdate(id, updates)
 */

// PUBLIC_INTERFACE
export default function TodoItem({ todo, onToggle, onDelete, onUpdate }) {
  /** Todo item component with inline editing including due/repeat/remindAt, time blocking, notes, and dependencies. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [catDraft, setCatDraft] = useState(todo.category || "work");
  const [priDraft, setPriDraft] = useState(todo.priority || "medium");
  const [dueDraft, setDueDraft] = useState(todo.dueDate ? toLocalDateInput(todo.dueDate) : "");
  const [repeatDraft, setRepeatDraft] = useState(todo.repeat || "none");
  const [remindDraft, setRemindDraft] = useState(todo.remindAt || "");
  const inputRef = useRef(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);

  // time blocking drafts
  const [startDate, setStartDate] = useState(todo.startTime ? toLocalDateInput(todo.startTime) : "");
  const [startTime, setStartTime] = useState(todo.startTime ? toLocalTimeInput(todo.startTime) : "");
  const [endDate, setEndDate] = useState(todo.endTime ? toLocalDateInput(todo.endTime) : (todo.startTime ? toLocalDateInput(todo.startTime) : ""));
  const [endTime, setEndTime] = useState(todo.endTime ? toLocalTimeInput(todo.endTime) : "");
  const [timeError, setTimeError] = useState("");

  // Dependencies editing
  const [showDepsEdit, setShowDepsEdit] = useState(false);
  const [depDraft, setDepDraft] = useState(Array.isArray(todo.dependencies) ? todo.dependencies : []);
  const { todos: allTasks, isBlocked, setTaskDependencies, detectCycle, addAttachment, removeAttachment, replaceAttachmentMeta } = useTodos();

  function toLocalDateInput(iso) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function toLocalTimeInput(iso) {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  function buildISO(d, t) {
    if (!d || !t) return null;
    try {
      const [y, m, day] = d.split("-").map((s) => parseInt(s, 10));
      const [hh, mm] = t.split(":").map((s) => parseInt(s, 10));
      const dt = new Date(y, (m - 1), day, hh || 0, mm || 0, 0, 0);
      return dt.toISOString();
    } catch {
      return null;
    }
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

    setStartDate(todo.startTime ? toLocalDateInput(todo.startTime) : "");
    setStartTime(todo.startTime ? toLocalTimeInput(todo.startTime) : "");
    setEndDate(todo.endTime ? toLocalDateInput(todo.endTime) : (todo.startTime ? toLocalDateInput(todo.startTime) : ""));
    setEndTime(todo.endTime ? toLocalTimeInput(todo.endTime) : "");
  }, [todo.title, todo.category, todo.priority, todo.dueDate, todo.repeat, todo.remindAt, todo.startTime, todo.endTime]);

  useEffect(() => {
    setDepDraft(Array.isArray(todo.dependencies) ? todo.dependencies : []);
  }, [todo.dependencies]);

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

    // time blocking normalization
    const sISO = buildISO(startDate, startTime);
    const eISO = buildISO(endDate || startDate, endTime);
    const { start, end, error } = safeNormalize(sISO, eISO);
    if (error) setTimeError(error);
    if ((todo.startTime || null) !== (start || null)) updates.startTime = start;
    if ((todo.endTime || null) !== (end || null)) updates.endTime = end;

    if (Object.keys(updates).length > 0) {
      onUpdate(todo.id, updates);
    }
    setEditing(false);
  };

  const safeNormalize = (sISO, eISO) => {
    if (!sISO && !eISO) return { start: null, end: null, error: "" };
    if (sISO && !eISO) return { start: sISO, end: new Date(new Date(sISO).getTime() + 30 * 60000).toISOString(), error: "" };
    if (!sISO && eISO) return { start: new Date(new Date(eISO).getTime() - 30 * 60000).toISOString(), end: eISO, error: "" };
    try {
      const s = new Date(sISO);
      const e = new Date(eISO);
      if (e.getTime() < s.getTime()) {
        return { start: s.toISOString(), end: new Date(s.getTime() + 30 * 60000).toISOString(), error: "End time must be after start time; adjusted to 30 minutes after start." };
      }
      return { start: s.toISOString(), end: e.toISOString(), error: "" };
    } catch {
      return { start: null, end: null, error: "Invalid time range." };
    }
  };

  const cancelEdit = () => {
    setDraft(todo.title);
    setCatDraft(todo.category || "work");
    setPriDraft(todo.priority || "medium");
    setDueDraft(todo.dueDate ? toLocalDateInput(todo.dueDate) : "");
    setRepeatDraft(todo.repeat || "none");
    setRemindDraft(todo.remindAt || "");
    setStartDate(todo.startTime ? toLocalDateInput(todo.startTime) : "");
    setStartTime(todo.startTime ? toLocalTimeInput(todo.startTime) : "");
    setEndDate(todo.endTime ? toLocalDateInput(todo.endTime) : (todo.startTime ? toLocalDateInput(todo.startTime) : ""));
    setEndTime(todo.endTime ? toLocalTimeInput(todo.endTime) : "");
    setTimeError("");
    setEditing(false);
  };

  const category = todo.category || "work";
  const priority = todo.priority || "medium";
  const isOverdue = !!todo.dueDate && !todo.completed && new Date() > new Date(todo.dueDate);

  const repeatLabel = (r) => {
    if (!r || r === "none") return null;
    return r;
  };

  const timeBadge = (() => {
    if (!todo.startTime || !todo.endTime) return null;
    const s = new Date(todo.startTime);
    const e = new Date(todo.endTime);
    const sh = String(s.getHours()).padStart(2, "0");
    const sm = String(s.getMinutes()).padStart(2, "0");
    const eh = String(e.getHours()).padStart(2, "0");
    const em = String(e.getMinutes()).padStart(2, "0");
    return `${sh}:${sm}\u2013${eh}:${em}`;
  })();

  const notes = Array.isArray(todo.notes) ? todo.notes : [];
  const noteCount = notes.length;

  // Handlers to update task notes by calling onUpdate with a new notes array
  const addNote = (taskId, note) => {
    const arr = Array.isArray(todo.notes) ? [...todo.notes] : [];
    arr.unshift(note);
    onUpdate(taskId, { notes: arr });
  };
  const updateNote = (taskId, noteId, patch) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => n.id === noteId ? { ...n, ...patch } : n);
    onUpdate(taskId, { notes: arr });
  };
  const deleteNote = (taskId, noteId) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).filter(n => n.id !== noteId);
    onUpdate(taskId, { notes: arr });
  };
  const addChecklistItem = (taskId, noteId, itemText) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => {
      if (n.id !== noteId) return n;
      const items = Array.isArray(n.items) ? [...n.items] : [];
      const item = { id: `ci_${Math.random().toString(36).slice(2)}_${Date.now()}`, text: itemText, done: false };
      return { ...n, checklist: true, items: [...items, item], updatedAt: new Date().toISOString() };
    });
    onUpdate(taskId, { notes: arr });
  };
  const toggleChecklistItem = (taskId, noteId, itemId) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).map(it => it.id === itemId ? ({ ...it, done: !it.done }) : it);
      return { ...n, items, updatedAt: new Date().toISOString() };
    });
    onUpdate(taskId, { notes: arr });
  };
  const deleteChecklistItem = (taskId, noteId, itemId) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).filter(it => it.id !== itemId);
      return { ...n, items, updatedAt: new Date().toISOString() };
    });
    onUpdate(taskId, { notes: arr });
  };

  const blocked = !todo.completed && isBlocked(todo, allTasks);

  return (
    <div className={`item ${blocked ? "blocked" : ""}`} role="listitem" aria-label={`Task ${todo.title}`}>
      <input
        type="checkbox"
        className="checkbox"
        checked={!!todo.completed}
        onChange={() => onToggle(todo.id)}
        aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
        disabled={!todo.completed && blocked}
        title={!todo.completed && blocked ? "Blocked by dependencies. Complete prerequisites first." : undefined}
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

              {/* Time blocking inline editing */}
              <input
                className="inline-input"
                type="date"
                aria-label="Edit start date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ maxWidth: 160 }}
                title="Start date"
              />
              <input
                className="inline-input"
                type="time"
                aria-label="Edit start time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ maxWidth: 140 }}
                title="Start time"
              />
              <input
                className="inline-input"
                type="date"
                aria-label="Edit end date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ maxWidth: 160 }}
                title="End date"
              />
              <input
                className="inline-input"
                type="time"
                aria-label="Edit end time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ maxWidth: 140 }}
                title="End time"
              />

              <button className="btn btn-small" onClick={confirmEdit} aria-label="Save edits">Save</button>
              <button className="icon-btn" onClick={cancelEdit} aria-label="Cancel edits" title="Cancel">✖️</button>
              <button
                className={`chip ${showDepsEdit ? "chip-selected" : ""}`}
                type="button"
                onClick={() => setShowDepsEdit(v => !v)}
                aria-expanded={showDepsEdit}
                aria-label="Edit dependencies"
                title="Edit dependencies"
              >
                🔗 Dependencies
              </button>
            </div>
            {showDepsEdit && (
              <div className="deps-editor" role="region" aria-label="Dependencies editor">
                <DependencySelector
                  tasks={allTasks}
                  value={depDraft}
                  onChange={setDepDraft}
                  taskId={todo.id}
                  detectCycle={detectCycle}
                  ariaLabel="Select dependencies for this task"
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setTaskDependencies(todo.id, depDraft);
                      setShowDepsEdit(false);
                    }}
                    aria-label="Save dependencies"
                  >
                    Save Dependencies
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setDepDraft(Array.isArray(todo.dependencies) ? todo.dependencies : []);
                      setShowDepsEdit(false);
                    }}
                    aria-label="Cancel dependency edits"
                  >
                    ✖️
                  </button>
                </div>
              </div>
            )}
            {timeError ? <div role="status" aria-live="polite" style={{ color: "#EF4444", fontSize: 12 }}>{timeError}</div> : null}
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
              {timeBadge ? <span className="chip chip-due" title="Scheduled time">{timeBadge}</span> : null}
              {todo.dueDate ? (
                <span className={`chip ${isOverdue ? "chip-overdue" : "chip-due"}`} title={`Due ${new Date(todo.dueDate).toLocaleString()}`}>
                  {isOverdue ? "Overdue" : "Due"}: {new Date(todo.dueDate).toLocaleDateString()}
                </span>
              ) : null}
              {repeatLabel(todo.repeat) ? (
                <span className="chip chip-repeat" title={`Repeats ${todo.repeat}`}>{repeatLabel(todo.repeat)}</span>
              ) : null}
              {todo.remindAt ? (
                <span className="chip chip-remind" title={`Reminds at ${todo.remindAt}`}>
                  ⏰ {todo.remindAt}
                </span>
              ) : null}
              {todo.pinned ? (
                <span className="chip chip-pin" title="Pinned task" aria-label="Pinned task">⭐ Pinned</span>
              ) : null}
              {!todo.completed && blocked ? (
                <span className="chip chip-blocked" aria-label="Task is blocked by dependencies" title="Blocked by dependencies">
                  🔗 Blocked
                </span>
              ) : null}
            </div>
            {Array.isArray(todo.dependencies) && todo.dependencies.length > 0 ? (
              <div className="deps-inline" aria-label="Prerequisites">
                {(todo.dependencies || [])
                  .map(id => allTasks.find(t => t.id === id))
                  .filter(Boolean)
                  .map(dep => (
                    <span key={dep.id} className={`dep-pill ${dep.completed ? "done" : "pending"}`} title={dep.title}>
                      {dep.completed ? "✓" : "○"} {dep.title}
                    </span>
                  ))
                }
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="actions" aria-label="Item actions">
        <button
          className={`icon-btn ${todo.pinned ? 'pin-active' : ''}`}
          onClick={() => onUpdate(todo.id, { pinned: !todo.pinned })}
          aria-label={todo.pinned ? "Unpin task" : "Pin task"}
          title={todo.pinned ? "Unpin" : "Pin"}
        >
          {todo.pinned ? "⭐" : "☆"}
        </button>
        <button
          className="icon-btn"
          onClick={() => setShowNotes(v => !v)}
          aria-label={showNotes ? "Hide notes" : "Show notes"}
          aria-expanded={showNotes}
          title="Notes"
        >
          📝
        </button>
        <NotesBadge count={noteCount} onClick={() => setShowNotes(true)} />
        <button
          className="icon-btn"
          onClick={() => setShowAttachments(v => !v)}
          aria-label={showAttachments ? "Hide attachments" : "Show attachments"}
          aria-expanded={showAttachments}
          title="Attachments"
        >
          📎
        </button>
        <AttachmentsBadge
          count={Array.isArray(todo.attachments) ? todo.attachments.length : 0}
          onClick={() => setShowAttachments(true)}
        />
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
      {showNotes && (
        <div className="notes-expando" role="region" aria-label="Task notes area">
          <TaskNotes
            task={{ ...todo, notes }}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onAddChecklistItem={addChecklistItem}
            onToggleChecklistItem={toggleChecklistItem}
            onDeleteChecklistItem={deleteChecklistItem}
            onClose={() => setShowNotes(false)}
          />
        </div>
      )}
      {showAttachments && (
        <div className="notes-expando" role="region" aria-label="Task attachments area">
          <TaskAttachments
            task={todo}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            replaceAttachmentMeta={replaceAttachmentMeta}
            onClose={() => setShowAttachments(false)}
          />
        </div>
      )}
    </div>
  );
}
