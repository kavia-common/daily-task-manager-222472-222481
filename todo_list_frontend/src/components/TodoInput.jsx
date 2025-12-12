import { useState } from "react";

/**
 * Input bar for adding a new todo.
 * Props:
 * - onAdd(title: string): void
 */

// PUBLIC_INTERFACE
export default function TodoInput({ onAdd }) {
  /** Input component allowing users to add todos with Enter or button. */
  const [value, setValue] = useState("");

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
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
      <button className="btn" onClick={submit} aria-label="Add task">
        Add
      </button>
    </div>
  );
}
