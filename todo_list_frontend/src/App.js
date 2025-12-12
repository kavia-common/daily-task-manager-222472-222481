import React, { useMemo, useState } from 'react';
import './App.css';
import './styles/theme.css';
import TodoInput from './components/TodoInput';
import TodoList from './components/TodoList';
import { useTodos } from './hooks/useTodos';

// PUBLIC_INTERFACE
function App() {
  /**
   * Top-level component for the To-Do app with category/priority controls.
   * Renders a centered column layout with an input bar and task list.
   */
  const { todos, loading, error, addTodo, updateTodo, toggleTodo, deleteTodo, hasBackend } = useTodos();

  // Filters and sorting
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [prioritySort, setPrioritySort] = useState('none'); // 'none' | 'high-first' | 'low-first'

  const filteredTodos = useMemo(() => {
    const cat = String(categoryFilter || 'all');
    const pri = String(priorityFilter || 'all');
    let items = (todos || []).filter((t) => {
      const tCat = t.category || 'work';
      const tPri = t.priority || 'medium';
      const okCat = cat === 'all' ? true : tCat === cat;
      const okPri = pri === 'all' ? true : tPri === pri;
      return okCat && okPri;
    });
    if (prioritySort !== 'none') {
      const weight = { high: 3, medium: 2, low: 1 };
      items = [...items].sort((a, b) => {
        const aw = weight[a.priority || 'medium'];
        const bw = weight[b.priority || 'medium'];
        return prioritySort === 'high-first' ? bw - aw : aw - bw;
      });
    }
    return items;
  }, [todos, categoryFilter, priorityFilter, prioritySort]);

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

        <div className="filters" aria-label="Task filters">
          <div className="filter-group">
            <label htmlFor="category-filter" className="filter-label">Category</label>
            <select
              id="category-filter"
              className="select"
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="work">Work</option>
              <option value="home">Home</option>
              <option value="study">Study</option>
              <option value="shopping">Shopping</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="priority-filter" className="filter-label">Priority</label>
            <select
              id="priority-filter"
              className="select"
              aria-label="Filter by priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="priority-sort" className="filter-label">Sort</label>
            <select
              id="priority-sort"
              className="select"
              aria-label="Sort by priority"
              value={prioritySort}
              onChange={(e) => setPrioritySort(e.target.value)}
            >
              <option value="none">No sort</option>
              <option value="high-first">High → Low</option>
              <option value="low-first">Low → High</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading...</div>
        ) : error ? (
          <div className="empty" style={{ color: "#EF4444" }}>
            An error occurred. Working in local mode.
          </div>
        ) : null}

        <TodoList
          todos={filteredTodos}
          onToggle={toggleTodo}
          onDelete={deleteTodo}
          onUpdate={updateTodo}
        />
      </main>
    </div>
  );
}

export default App;
