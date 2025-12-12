import { useState } from "react";

/**
 * Input bar for adding a new todo.
 * Props:
 * - onAdd(title: string, category?: string, priority?: string): void
 */

// PUBLIC_INTERFACE
export default function TodoInput({ onAdd }) {
  /** Input component allowing users to add todos with Enter or button, including category and priority. */
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("work");
  const [priority, setPriority] = useState("medium");

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v, category, priority);
    setValue("");
    // keep last selected category/priority for convenience
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
      <button className="btn" onClick={submit} aria-label="Add task">
        Add
      </button>
    </div>
  );
}
