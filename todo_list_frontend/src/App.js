import React, { useMemo, useState } from 'react';
import './App.css';
import './styles/theme.css';
import TodoInput from './components/TodoInput';
import TodoList from './components/TodoList';
import ProductivityHeader from './components/ProductivityHeader';
import DailyView from './components/DailyView';
import WeeklySummary from './components/WeeklySummary';
import { useTodos } from './hooks/useTodos';

// PUBLIC_INTERFACE
function App() {
  /**
   * Top-level component for the To-Do app with productivity tabs (All | Today | Weekly),
   * category/priority controls and due/notification filters.
   */
  const {
    todos,
    loading,
    error,
    addTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    hasBackend,
    toasts,
    dismissToast,
    // productivity
    todayTotals,
    todaysTodos,
    last7Days,
    currentStreak,
    bestStreak,
    todayScore,
  } = useTodos();

  // Filters and sorting
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [prioritySort, setPrioritySort] = useState('none'); // 'none' | 'high-first' | 'low-first'
  const [dueFilter, setDueFilter] = useState('all'); // 'all' | 'today' | 'week' | 'overdue'

  // Tabs
  const [tab, setTab] = useState('all'); // 'all' | 'today' | 'weekly'

  const withinSameDay = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
  };
  const withinThisWeek = (iso) => {
    if (!iso) return false;
    const target = new Date(iso);
    const now = new Date();
    const oneDay = 86400000;
    const dayOfWeek = now.getDay(); // 0-6
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(start.getTime() - dayOfWeek * oneDay);
    const weekEnd = new Date(weekStart.getTime() + 7 * oneDay);
    return target >= weekStart && target < weekEnd;
  };
  const isOverdue = (iso, completed) => {
    if (!iso || completed) return false;
    return new Date() > new Date(iso);
  };

  const filteredTodos = useMemo(() => {
    const cat = String(categoryFilter || 'all');
    const pri = String(priorityFilter || 'all');
    const due = String(dueFilter || 'all');
    let source = todos || [];
    if (tab === 'today') {
      source = todaysTodos;
    }
    let items = source.filter((t) => {
      const tCat = t.category || 'work';
      const tPri = t.priority || 'medium';
      const okCat = cat === 'all' ? true : tCat === cat;
      const okPri = pri === 'all' ? true : tPri === pri;

      let okDue = true;
      if (due === 'today') okDue = !!t.dueDate && withinSameDay(t.dueDate);
      else if (due === 'week') okDue = !!t.dueDate && withinThisWeek(t.dueDate);
      else if (due === 'overdue') okDue = isOverdue(t.dueDate, t.completed);

      return okCat && okPri && okDue;
    });

    // Apply existing priority sort within groups while ensuring pinned first
    const pinSort = (a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return 0;
    };

    if (prioritySort !== 'none') {
      const weight = { high: 3, medium: 2, low: 1 };
      items = [...items].sort((a, b) => {
        const pinCmp = pinSort(a, b);
        if (pinCmp !== 0) return pinCmp;
        const aw = weight[a.priority || 'medium'];
        const bw = weight[b.priority || 'medium'];
        return prioritySort === 'high-first' ? bw - aw : aw - bw;
      });
    } else {
      items = [...items].sort(pinSort);
    }
    return items;
  }, [todos, todaysTodos, categoryFilter, priorityFilter, prioritySort, dueFilter, tab]);

  return (
    <div className="app-shell">
      <main className="card" role="main" aria-label="To-Do Application">
        <div className="header">
          <div className="header-title">Daily Tasks</div>
          <div className="header-badge" title={hasBackend ? "Using backend API" : "Using localStorage"}>
            {hasBackend ? "API Connected" : "Local Mode"}
          </div>
        </div>

        <ProductivityHeader
          todayTotals={todayTotals}
          todayScore={todayScore}
          currentStreak={currentStreak}
          bestStreak={bestStreak}
        />

        {/* Tabs */}
        <div className="tabs" role="tablist" aria-label="Views">
          <button
            role="tab"
            aria-selected={tab === 'all'}
            className={`tab ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >All</button>
          <button
            role="tab"
            aria-selected={tab === 'today'}
            className={`tab ${tab === 'today' ? 'active' : ''}`}
            onClick={() => setTab('today')}
          >Today</button>
          <button
            role="tab"
            aria-selected={tab === 'weekly'}
            className={`tab ${tab === 'weekly' ? 'active' : ''}`}
            onClick={() => setTab('weekly')}
          >Weekly</button>
        </div>

        {/* Notification/Toast area */}
        <div className="toast-area" aria-live="polite" aria-atomic="true">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.kind}`} role="status">
              <div className="toast-title">{t.title}</div>
              <div className="toast-body">{t.message}</div>
              <button className="icon-btn" aria-label="Dismiss notification" onClick={() => dismissToast(t.id)}>✖️</button>
            </div>
          ))}
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

          <div className="filter-group">
            <label htmlFor="due-filter" className="filter-label">Due</label>
            <select
              id="due-filter"
              className="select"
              aria-label="Filter by due"
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="overdue">Overdue</option>
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

        {tab === 'weekly' ? (
          <WeeklySummary days={last7Days} />
        ) : tab === 'today' ? (
          <DailyView
            todaysTodos={todaysTodos}
            todayTotals={todayTotals}
            onAdd={addTodo}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onUpdate={updateTodo}
          />
        ) : (
          <TodoList
            todos={filteredTodos}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onUpdate={updateTodo}
          />
        )}
      </main>
    </div>
  );
}

export default App;
