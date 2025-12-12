import TodoItem from "./TodoItem";
import { useTodos } from "../hooks/useTodos";
import EmptyState from "./EmptyState";

/**
 * Renders a list of todos or an empty state, with collision banner when collaboration conflicts occur.
 * Props:
 * - todos: array
 * - onToggle(id)
 * - onDelete(id)
 * - onUpdate(id, updates)
 */

// PUBLIC_INTERFACE
export default function TodoList({ todos, onToggle, onDelete, onUpdate }) {
  /** List component for displaying todos and empty state, with collision banner. */
  const { collision, resolveCollision } = useTodos();

  if (!todos || todos.length === 0) {
    return (
      <EmptyState
        title="No tasks yet — add your first task!"
        subtitle="Use the input above to quickly add a task and get started."
        icon="📝"
        variant="full"
      />
    );
  }

  return (
    <div className="list" role="list" aria-label="Tasks list">
      {collision && (
        <div className="collision-banner" role="alert" aria-live="polite">
          This task changed remotely. Reload remote or keep your edit?
          <div className="collision-actions">
            <button onClick={() => resolveCollision('reload')}>Reload remote</button>
            <button className="primary" onClick={() => resolveCollision('keep')}>Keep my edit</button>
          </div>
        </div>
      )}
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
