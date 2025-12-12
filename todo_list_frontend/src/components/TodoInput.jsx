import { useMemo, useState } from "react";

/**
 * Input bar for adding a new todo.
 * Props:
 * - onAdd(title: string, category?: string, priority?: string, dueDate?: string|null, repeat?: 'none'|'daily'|'weekly'|'monthly', remindAt?: string|null): void
 */

// PUBLIC_INTERFACE
export default function TodoInput({ onAdd }) {
  /** Input component allowing users to add todos with Enter or button, including category, priority, due, repeat, reminder. */
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("work");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [remindAt, setRemindAt] = useState("");
  const [pinned, setPinned] = useState(false);

  const reminderAllowed = useMemo(() => {
    return Boolean(dueDate) || repeat !== "none";
  }, [dueDate, repeat]);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const due = dueDate ? new Date(dueDate).toISOString() : null;
    const remind = reminderAllowed && remindAt ? remindAt : null;
    onAdd(v, category, priority, due, repeat, remind, pinned);
    setValue("");
    setDueDate("");
    setRemindAt("");
    // keep last selected category/priority/repeat for convenience
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      submit();
    }
  };

  return (
    <div className="input-bar" role="form" aria-label="Add new task">
      <input
        className="input"
        aria-label="New task"
        placeholder="Add a new task..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <select
        className="select"
        aria-label="Select category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        title="Task category"
      >
        <option value="work">Work</option>
        <option value="home">Home</option>
        <option value="study">Study</option>
        <option value="shopping">Shopping</option>
      </select>
      <select
        className="select"
        aria-label="Select priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        title="Task priority"
      >
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <label className="sr-only" htmlFor="due-date-input">Due Date</label>
      <input
        id="due-date-input"
        className="input"
        type="date"
        aria-label="Due date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        title="Due Date"
        style={{ maxWidth: 160 }}
      />
      <label className="sr-only" htmlFor="repeat-select">Repeat</label>
      <select
        id="repeat-select"
        className="select"
        aria-label="Select repeat"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        title="Repeat"
      >
        <option value="none">No repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
      <label className="sr-only" htmlFor="reminder-time">Reminder Time</label>
      <input
        id="reminder-time"
        className="input"
        type="time"
        aria-label="Reminder time"
        value={remindAt}
        onChange={(e) => setRemindAt(e.target.value)}
        title="Reminder Time"
        style={{ maxWidth: 140 }}
        disabled={!reminderAllowed}
      />
      <label className="pin-toggle" title="Pin task">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          aria-label="Pin task on creation"
        />
        <span className="pin-label">⭐ Pin task</span>
      </label>
      <button className="btn" onClick={submit} aria-label="Add task">
        Add
      </button>
    </div>
  );
}
