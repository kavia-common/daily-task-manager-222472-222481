import { useEffect, useRef, useState } from "react";
import TaskNotes from "./TaskNotes";
import NotesBadge from "./NotesBadge";
import AttachmentsBadge from "./AttachmentsBadge";
import TaskAttachments from "./TaskAttachments";
import DependencySelector from "./DependencySelector";
import AssigneeSelector from "./AssigneeSelector";
import { useTodos } from "../hooks/useTodos";

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
  } catch { return null; }
}
function avatarInitials(s) {
  return s
    .split('@')[0]
    .split('.')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Enhanced TodoItem with assignees, sharing, presence-aware editing, and collision detection.
 * Props: todo, onToggle, onDelete, onUpdate
 */
// PUBLIC_INTERFACE
export default function TodoItem({ todo, onToggle, onDelete, onUpdate }) {
  /** Todo item with collaboration UI and existing features preserved. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title || todo.text);
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
  const { todos: allTasks, isBlocked, setTaskDependencies, detectCycle, addAttachment, removeAttachment, replaceAttachmentMeta, canEdit } = useTodos();

  // collaboration fields
  const [assigning, setAssigning] = useState(false);
  const [assignees, setAssignees] = useState(Array.isArray(todo.assignees) ? todo.assignees : []);
  const [sharedWith, setSharedWith] = useState(Array.isArray(todo.sharedWith) ? todo.sharedWith : []);
  const disabled = !canEdit(todo);

  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  useEffect(() => {
    setDraft(todo.title || todo.text);
    setCatDraft(todo.category || "work");
    setPriDraft(todo.priority || "medium");
    setDueDraft(todo.dueDate ? toLocalDateInput(todo.dueDate) : "");
    setRepeatDraft(todo.repeat || "none");
    setRemindDraft(todo.remindAt || "");
    setStartDate(todo.startTime ? toLocalDateInput(todo.startTime) : "");
    setStartTime(todo.startTime ? toLocalTimeInput(todo.startTime) : "");
    setEndDate(todo.endTime ? toLocalDateInput(todo.endTime) : (todo.startTime ? toLocalDateInput(todo.startTime) : ""));
    setEndTime(todo.endTime ? toLocalTimeInput(todo.endTime) : "");
    setAssignees(Array.isArray(todo.assignees) ? todo.assignees : []);
    setSharedWith(Array.isArray(todo.sharedWith) ? todo.sharedWith : []);
  }, [todo]);

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

  const confirmEdit = () => {
    if (disabled) return;
    const v = (draft || "").trim();
    if (!v) { onDelete(todo.id); setEditing(false); return; }
    const updates = {};
    if (v !== (todo.title || todo.text)) updates.title = v;
    if ((todo.category || "work") !== catDraft) updates.category = catDraft;
    if ((todo.priority || "medium") !== priDraft) updates.priority = priDraft;
    const reminderAllowed = Boolean(dueDraft) || repeatDraft !== "none";
    const dueISO = dueDraft ? new Date(dueDraft).toISOString() : null;
    const remind = reminderAllowed && remindDraft ? remindDraft : null;
    if ((todo.dueDate || null) !== (dueISO || null)) updates.dueDate = dueISO;
    if ((todo.repeat || "none") !== repeatDraft) updates.repeat = repeatDraft;
    if ((todo.remindAt || null) !== (remind || null)) updates.remindAt = remind;

    const sISO = buildISO(startDate, startTime);
    const eISO = buildISO(endDate || startDate, endTime);
    const { start, end, error } = safeNormalize(sISO, eISO);
    if (error) setTimeError(error);
    if ((todo.startTime || null) !== (start || null)) updates.startTime = start;
    if ((todo.endTime || null) !== (end || null)) updates.endTime = end;

    if (Object.keys(updates).length > 0) {
      onUpdate(todo.id, { ...updates, expectedUpdatedAt: todo.updatedAt });
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(todo.title || todo.text);
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
  const timeBadge = (() => {
    if (!todo.startTime || !todo.endTime) return null;
    const s = new Date(todo.startTime);
    const e = new Date(todo.endTime);
    const sh = String(s.getHours()).padStart(2, "0");
    const sm = String(s.getMinutes()).padStart(2, "0");
    const eh = String(e.getHours()).padStart(2, "0");
    const em = String(e.getMinutes()).padStart(2, "0");
    return `${sh}:${sm}–${eh}:${em}`;
  })();

  const notes = Array.isArray(todo.notes) ? todo.notes : [];
  const noteCount = notes.length;

  const addNote = (taskId, note) => {
    const arr = Array.isArray(todo.notes) ? [...todo.notes] : [];
    arr.unshift(note);
    onUpdate(taskId, { notes: arr, expectedUpdatedAt: todo.updatedAt });
  };
  const updateNote = (taskId, noteId, patch) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => n.id === noteId ? { ...n, ...patch } : n);
    onUpdate(taskId, { notes: arr, expectedUpdatedAt: todo.updatedAt });
  };
  const deleteNote = (taskId, noteId) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).filter(n => n.id !== noteId);
    onUpdate(taskId, { notes: arr, expectedUpdatedAt: todo.updatedAt });
  };
  const addChecklistItem = (taskId, noteId, itemText) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => {
      if (n.id !== noteId) return n;
      const items = Array.isArray(n.items) ? [...n.items] : [];
      const item = { id: `ci_${Math.random().toString(36).slice(2)}_${Date.now()}`, text: itemText, done: false };
      return { ...n, checklist: true, items: [...items, item], updatedAt: new Date().toISOString() };
    });
    onUpdate(taskId, { notes: arr, expectedUpdatedAt: todo.updatedAt });
  };
  const toggleChecklistItem = (taskId, noteId, itemId) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).map(it => it.id === itemId ? ({ ...it, done: !it.done }) : it);
      return { ...n, items, updatedAt: new Date().toISOString() };
    });
    onUpdate(taskId, { notes: arr, expectedUpdatedAt: todo.updatedAt });
  };
  const deleteChecklistItem = (taskId, noteId, itemId) => {
    const arr = (Array.isArray(todo.notes) ? todo.notes : []).map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).filter(it => it.id !== itemId);
      return { ...n, items, updatedAt: new Date().toISOString() };
    });
    onUpdate(taskId, { notes: arr, expectedUpdatedAt: todo.updatedAt });
  };

  const blocked = !todo.completed && isBlocked(todo, allTasks);

  return (
    <div className={`item ${blocked ? "blocked" : ""}`} role="listitem" aria-label={`Task ${todo.title || todo.text}`}>
      <input
        type="checkbox"
        className="checkbox"
        checked={!!todo.completed}
        onChange={() => !disabled && onToggle(todo.id)}
        aria-label={`Mark ${todo.title || todo.text} as ${todo.completed ? "incomplete" : "complete"}`}
        disabled={(!todo.completed && blocked) || disabled}
        title={!todo.completed && blocked ? "Blocked by dependencies. Complete prerequisites first." : (disabled ? "You don’t have permission to edit this task" : undefined)}
      />
      <div style={{ width: "100%" }}>
        {editing ? (
          <div style={{ display: "grid", gap: 8 }}>
            <input
              ref={inputRef}
              className="inline-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") cancelEdit(); }}
              aria-label="Edit task"
              disabled={disabled}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="select small" aria-label="Edit category" value={catDraft} onChange={(e) => setCatDraft(e.target.value)} disabled={disabled}>
                <option value="work">Work</option>
                <option value="home">Home</option>
                <option value="study">Study</option>
                <option value="shopping">Shopping</option>
              </select>
              <select className="select small" aria-label="Edit priority" value={priDraft} onChange={(e) => setPriDraft(e.target.value)} disabled={disabled}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <input className="inline-input" type="date" aria-label="Edit due date" value={dueDraft} onChange={(e) => setDueDraft(e.target.value)} style={{ maxWidth: 180 }} disabled={disabled} />
              <select className="select small" aria-label="Edit repeat" value={repeatDraft} onChange={(e) => setRepeatDraft(e.target.value)} disabled={disabled}>
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input className="inline-input" type="time" aria-label="Edit reminder time" value={remindDraft} onChange={(e) => setRemindDraft(e.target.value)} disabled={disabled || !(Boolean(dueDraft) || repeatDraft !== "none")} style={{ maxWidth: 140 }} />

              {/* Time blocking inline editing */}
              <input className="inline-input" type="date" aria-label="Edit start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ maxWidth: 160 }} title="Start date" disabled={disabled} />
              <input className="inline-input" type="time" aria-label="Edit start time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ maxWidth: 140 }} title="Start time" disabled={disabled} />
              <input className="inline-input" type="date" aria-label="Edit end date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ maxWidth: 160 }} title="End date" disabled={disabled} />
              <input className="inline-input" type="time" aria-label="Edit end time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ maxWidth: 140 }} title="End time" disabled={disabled} />

              <button className="btn btn-small" onClick={confirmEdit} aria-label="Save edits" disabled={disabled}>Save</button>
              <button className="icon-btn" onClick={cancelEdit} aria-label="Cancel edits" title="Cancel">✖️</button>
              <button className={`chip ${showDepsEdit ? "chip-selected" : ""}`} type="button" onClick={() => setShowDepsEdit(v => !v)} aria-expanded={showDepsEdit} aria-label="Edit dependencies" title="Edit dependencies">
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
                  <button className="btn btn-small" onClick={() => { setTaskDependencies(todo.id, depDraft); setShowDepsEdit(false); }} aria-label="Save dependencies">Save Dependencies</button>
                  <button className="icon-btn" onClick={() => { setDepDraft(Array.isArray(todo.dependencies) ? todo.dependencies : []); setShowDepsEdit(false); }} aria-label="Cancel dependency edits">✖️</button>
                </div>
              </div>
            )}
            {timeError ? <div role="status" aria-live="polite" style={{ color: "#EF4444", fontSize: 12 }}>{timeError}</div> : null}
          </div>
        ) : (
          <div className={`title ${todo.completed ? "completed" : ""}`} onDoubleClick={() => !disabled && setEditing(true)} title={disabled ? "You don’t have permission to edit this task" : "Double-click to edit"}>
            {todo.title || todo.text}
            <div className="meta">
              <span className={`chip chip-cat ${category}`}>{category}</span>
              <span className={`chip chip-pri ${priority}`}>{priority}</span>
              {timeBadge ? <span className="chip chip-due" title="Scheduled time">{timeBadge}</span> : null}
              {todo.dueDate ? (
                <span className={`chip ${isOverdue ? "chip-overdue" : "chip-due"}`} title={`Due ${new Date(todo.dueDate).toLocaleString()}`}>
                  {isOverdue ? "Overdue" : "Due"}: {new Date(todo.dueDate).toLocaleDateString()}
                </span>
              ) : null}
              {todo.repeat && todo.repeat !== 'none' ? (
                <span className="chip chip-repeat" title={`Repeats ${todo.repeat}`}>{todo.repeat}</span>
              ) : null}
              {todo.remindAt ? (
                <span className="chip chip-remind" title={`Reminds at ${todo.remindAt}`}>⏰ {todo.remindAt}</span>
              ) : null}
              {todo.pinned ? <span className="chip chip-pin" title="Pinned task" aria-label="Pinned task">⭐ Pinned</span> : null}
              {!todo.completed && blocked ? <span className="chip chip-blocked" aria-label="Task is blocked by dependencies" title="Blocked by dependencies">🔗 Blocked</span> : null}
            </div>

            {/* Assignees and shared status */}
            <div className="meta" aria-label="Assignees">
              <span className="avatar me" title={todo.owner || 'me'} aria-label={`Owner ${todo.owner || 'me'}`}>{avatarInitials(todo.owner || 'me')}</span>
              {(assignees || []).map((u) => (
                <span key={u} className="avatar" title={u} aria-label={`Assignee ${u}`}>{avatarInitials(u)}</span>
              ))}
              {Array.isArray(sharedWith) && sharedWith.length > 0 && (
                <span className="chip chip-repeat" aria-label="Shared with others" title={`Shared with ${sharedWith.length}`}>Shared</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="actions" aria-label="Item actions">
        <button className="chip" onClick={() => !disabled && setAssigning((a) => !a)} aria-haspopup="dialog" aria-expanded={assigning} title={disabled ? "You don’t have permission to edit this task" : "Assign users"} disabled={disabled}>
          Assign
        </button>
        <button className={`icon-btn ${todo.pinned ? 'pin-active' : ''}`} onClick={() => !disabled && onUpdate(todo.id, { pinned: !todo.pinned, expectedUpdatedAt: todo.updatedAt })} aria-label={todo.pinned ? "Unpin task" : "Pin task"} title={todo.pinned ? "Unpin" : "Pin"} disabled={disabled}>
          {todo.pinned ? "⭐" : "☆"}
        </button>
        <button className="icon-btn" onClick={() => setShowNotes(v => !v)} aria-label={showNotes ? "Hide notes" : "Show notes"} aria-expanded={showNotes} title="Notes">
          📝
        </button>
        <NotesBadge count={noteCount} onClick={() => setShowNotes(true)} />
        <button className="icon-btn" onClick={() => setShowAttachments(v => !v)} aria-label={showAttachments ? "Hide attachments" : "Show attachments"} aria-expanded={showAttachments} title="Attachments">
          📎
        </button>
        <AttachmentsBadge count={Array.isArray(todo.attachments) ? todo.attachments.length : 0} onClick={() => setShowAttachments(true)} />
        <button className="icon-btn" onClick={() => !disabled && setEditing((v) => !v)} aria-label={editing ? "Finish editing" : "Edit task"} title={editing ? "Finish editing" : "Edit"} disabled={disabled}>
          ✏️
        </button>
        <button className="icon-btn danger" onClick={() => onDelete(todo.id)} aria-label="Delete task" title="Delete">
          🗑️
        </button>
      </div>

      {assigning && (
        <div className="assign-popover" role="dialog" aria-label="Assign users">
          <AssigneeSelector id={`assign-${todo.id}`} label="Assignees" value={assignees} onChange={(next) => { setAssignees(next); onUpdate(todo.id, { assignees: next, expectedUpdatedAt: todo.updatedAt }); }} />
          <AssigneeSelector id={`share-${todo.id}`} label="Share with" value={sharedWith} onChange={(next) => { setSharedWith(next); onUpdate(todo.id, { sharedWith: next, expectedUpdatedAt: todo.updatedAt }); }} />
          <button className="close-pop" onClick={() => setAssigning(false)} aria-label="Close assignment">Close</button>
        </div>
      )}

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
