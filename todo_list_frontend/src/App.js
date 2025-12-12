import React from 'react';
import './App.css';
import './styles/theme.css';
import TodoInput from './components/TodoInput';
import TodoList from './components/TodoList';
import { useTodos } from './hooks/useTodos';

// PUBLIC_INTERFACE
function App() {
  /**
   * Top-level component for the To-Do app.
   * Renders a centered column layout with an input bar and task list.
   */
  const { todos, loading, error, addTodo, updateTodo, toggleTodo, deleteTodo, hasBackend } = useTodos();

  return (
    <div className="app-shell">
      <main className="card" role="main" aria-label="To-Do Application">
        <div className="header">
          <div className="header-title">Daily Tasks</div>
          <div className="header-badge" title={hasBackend ? "Using backend API" : "Using localStorage"}>
            {hasBackend ? "API Connected" : "Local Mode"}
          </div>
        </div>

        <TodoInput onAdd={addTodo} />

        {loading ? (
          <div className="empty">Loading...</div>
        ) : error ? (
          <div className="empty" style={{ color: "#EF4444" }}>
            An error occurred. Working in local mode.
          </div>
        ) : null}

        <TodoList
          todos={todos}
          onToggle={toggleTodo}
          onDelete={deleteTodo}
          onUpdate={updateTodo}
        />
      </main>
    </div>
  );
}

export default App;
