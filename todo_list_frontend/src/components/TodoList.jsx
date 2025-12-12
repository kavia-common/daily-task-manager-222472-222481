import TodoItem from "./TodoItem";

/**
 * Renders a list of todos or an empty state.
 * Props:
 * - todos: array
 * - onToggle(id)
 * - onDelete(id)
 * - onUpdate(id, updates)
 */

// PUBLIC_INTERFACE
export default function TodoList({ todos, onToggle, onDelete, onUpdate }) {
  /** List component for displaying todos and empty state. */
  if (!todos || todos.length === 0) {
    return <div className="empty">No tasks yet. Add your first task above.</div>;
  }

  return (
    <div className="list" role="list" aria-label="Tasks list">
      {todos.map((t) => (
        <TodoItem
          key={t.id}
          todo={t}
          onToggle={onToggle}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
