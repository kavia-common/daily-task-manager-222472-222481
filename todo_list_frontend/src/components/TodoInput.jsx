import { useMemo, useState } from "react";

/**
 * Input bar for adding a new todo.
 * Props:
 * - onAdd(title: string, category?: string, priority?: string, dueDate?: string|null, repeat?: 'none'|'daily'|'weekly'|'monthly', remindAt?: string|null, pinned?: boolean, startTime?: string|null, endTime?: string|null): void
 */

// PUBLIC_INTERFACE
export default function TodoInput({ onAdd }) {
  /** Input component allowing users to add todos with Enter or button, including category, priority, due, repeat, reminder, and optional time blocking. */
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("work");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [remindAt, setRemindAt] = useState("");
  const [pinned, setPinned] = useState(false);

  // time blocking inputs
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [startTime, setStartTime] = useState(""); // HH:MM
  const [endDate, setEndDate] = useState("");     // optional; defaults to startDate
  const [endTime, setEndTime] = useState("");     // HH:MM
  const [timeError, setTimeError] = useState("");

  const reminderAllowed = useMemo(() => {
    return Boolean(dueDate) || repeat !== "none";
  }, [dueDate, repeat]);

  const buildISO = (d, t) => {
    if (!d || !t) return null;
    try {
      const [y, m, day] = d.split("-").map((s) => parseInt(s, 10));
      const [hh, mm] = t.split(":").map((s) => parseInt(s, 10));
      const dt = new Date(y, (m - 1), day, hh || 0, mm || 0, 0, 0);
      return dt.toISOString();
    } catch {
      return null;
    }
  };

  const validateTimes = (sISO, eISO) => {
    if (!sISO && !eISO) {
      setTimeError("");
      return { start: null, end: null };
    }
    if (sISO && !eISO) {
      const e = new Date(new Date(sISO).getTime() + 30 * 60000).toISOString();
      setTimeError("");
      return { start: sISO, end: e };
    }
    if (!sISO && eISO) {
      const s = new Date(new Date(eISO).getTime() - 30 * 60000).toISOString();
      setTimeError("");
      return { start: s, end: eISO };
    }
    try {
      const s = new Date(sISO);
      const e = new Date(eISO);
      if (e.getTime() < s.getTime()) {
        setTimeError("End time must be after start time. Auto-adjusting to 30 minutes after start.");
        const fixedEnd = new Date(s.getTime() + 30 * 60000).toISOString();
        return { start: s.toISOString(), end: fixedEnd };
      }
      setTimeError("");
      return { start: s.toISOString(), end: e.toISOString() };
    } catch {
      setTimeError("Invalid date/time format.");
      return { start: null, end: null };
    }
  };

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const due = dueDate ? new Date(dueDate).toISOString() : null;
    const remind = reminderAllowed && remindAt ? remindAt : null;

    const sISO = buildISO(startDate, startTime);
    const eISO = buildISO(endDate || startDate, endTime);
    const { start, end } = validateTimes(sISO, eISO);

    onAdd(v, category, priority, due, repeat, remind, pinned, start, end);
    setValue("");
    setDueDate("");
    setRemindAt("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setTimeError("");
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
      {/* Time blocking controls */}
      <label className="sr-only" htmlFor="tb-start-date">Start date</label>
      <input
        id="tb-start-date"
        className="input"
        type="date"
        aria-label="Start date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        title="Start Date"
        style={{ maxWidth: 160 }}
      />
      <label className="sr-only" htmlFor="tb-start-time">Start time</label>
      <input
        id="tb-start-time"
        className="input"
        type="time"
        aria-label="Start time"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        title="Start Time"
        style={{ maxWidth: 140 }}
      />
      <label className="sr-only" htmlFor="tb-end-date">End date</label>
      <input
        id="tb-end-date"
        className="input"
        type="date"
        aria-label="End date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        title="End Date"
        style={{ maxWidth: 160 }}
      />
      <label className="sr-only" htmlFor="tb-end-time">End time</label>
      <input
        id="tb-end-time"
        className="input"
        type="time"
        aria-label="End time"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        title="End Time"
        style={{ maxWidth: 140 }}
      />
      {timeError ? <div role="status" aria-live="polite" style={{ color: "#EF4444", fontSize: 12 }}>{timeError}</div> : null}
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
