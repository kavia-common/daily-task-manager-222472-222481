import React, { useEffect, useRef, useState, useMemo } from 'react';
import './App.css';
import './styles/theme.css';
import TodoInput from './components/TodoInput';
import TodoList from './components/TodoList';
import ProductivityHeader from './components/ProductivityHeader';
import DailyView from './components/DailyView';
import WeeklySummary from './components/WeeklySummary';
import { useTodos } from './hooks/useTodos';
import QuickNotesPanel from './components/QuickNotesPanel';
import DayTimeline from './components/DayTimeline';
import { tasksForDay as selectorTasksForDay } from './hooks/useTodos';
import { CollaborationProvider } from './components/CollaborationProvider';

// PUBLIC_INTERFACE
function AppInner() {
  /**
   * Top-level component with collaboration toasts and existing views/tabs.
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
    // quick notes
    quickNotes,
    addQuickNote,
    updateQuickNote,
    deleteQuickNote,
    addQuickChecklistItem,
    toggleQuickChecklistItem,
    deleteQuickChecklistItem,
  } = useTodos();

  // Filters and sorting
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [prioritySort, setPrioritySort] = useState('none');
  const [dueFilter, setDueFilter] = useState('all');
  const [notesOnly, setNotesOnly] = useState(false);
  const [attachmentsOnly, setAttachmentsOnly] = useState(false);

  // Tabs
  const [tab, setTab] = useState('all');
  const [timelineDate, setTimelineDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

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
    const dayOfWeek = now.getDay();
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

      const okNotes = notesOnly ? Array.isArray(t.notes) && t.notes.length > 0 : true;
      const okAtts = attachmentsOnly ? Array.isArray(t.attachments) && t.attachments.length > 0 : true;
      return okCat && okPri && okDue && okNotes && okAtts;
    });

    const pinSort = (a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return 0;
    };

    const blocked = (t) => Array.isArray(t.dependencies) && t.dependencies.some(id => {
      const dep = (todos || []).find(x => x.id === id);
      return !dep || !dep.completed;
    });

    if (prioritySort !== 'none') {
      const weight = { high: 3, medium: 2, low: 1 };
      items = [...items].sort((a, b) => {
        const pinCmp = pinSort(a, b);
        if (pinCmp !== 0) return pinCmp;
        const aw = weight[a.priority || 'medium'];
        const bw = weight[b.priority || 'medium'];
        const priCmp = prioritySort === 'high-first' ? (bw - aw) : (aw - bw);
        if (priCmp !== 0) return priCmp;
        const ab = blocked(a) ? 1 : 0;
        const bb = blocked(b) ? 1 : 0;
        if (ab !== bb) return ab - bb;
        return 0;
      });
    } else {
      items = [...items].sort((a, b) => {
        const pinCmp = pinSort(a, b);
        if (pinCmp !== 0) return pinCmp;
        const ab = blocked(a) ? 1 : 0;
        const bb = blocked(b) ? 1 : 0;
        if (ab !== bb) return ab - bb;
        return 0;
      });
    }
    return items;
  }, [todos, todaysTodos, categoryFilter, priorityFilter, prioritySort, dueFilter, tab, notesOnly, attachmentsOnly]);

  const toastTimer = useRef(null);
  const [toastMsg, setToastMsg] = useState('');
  const todosHookForToast = useTodos();
  useEffect(() => {
    // register toast handler for remote updates
    if (todosHookForToast.setToastHandler) {
      todosHookForToast.setToastHandler((msg) => {
        setToastMsg(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(''), 2000);
      });
    }
  }, [todosHookForToast]);

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
          <button role="tab" aria-selected={tab === 'all'} className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
          <button role="tab" aria-selected={tab === 'today'} className={`tab ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>Today</button>
          <button role="tab" aria-selected={tab === 'weekly'} className={`tab ${tab === 'weekly' ? 'active' : ''}`} onClick={() => setTab('weekly')}>Weekly</button>
          <button role="tab" aria-selected={tab === 'timeline'} className={`tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>Timeline</button>
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

        <QuickNotesPanel
          notes={quickNotes}
          addQuickNote={addQuickNote}
          updateQuickNote={updateQuickNote}
          deleteQuickNote={deleteQuickNote}
          addQuickChecklistItem={addQuickChecklistItem}
          toggleQuickChecklistItem={toggleQuickChecklistItem}
          deleteQuickChecklistItem={deleteQuickChecklistItem}
        />

        <TodoInput onAdd={addTodo} />

        <div className="filters" aria-label="Task filters">
          <div className="filter-group">
            <label htmlFor="category-filter" className="filter-label">Category</label>
            <select id="category-filter" className="select" aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="work">Work</option>
              <option value="home">Home</option>
              <option value="study">Study</option>
              <option value="shopping">Shopping</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="priority-filter" className="filter-label">Priority</label>
            <select id="priority-filter" className="select" aria-label="Filter by priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="priority-sort" className="filter-label">Sort</label>
            <select id="priority-sort" className="select" aria-label="Sort by priority" value={prioritySort} onChange={(e) => setPrioritySort(e.target.value)}>
              <option value="none">No sort</option>
              <option value="high-first">High → Low</option>
              <option value="low-first">Low → High</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="due-filter" className="filter-label">Due</label>
            <select id="due-filter" className="select" aria-label="Filter by due" value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div className="filter-group" style={{ alignSelf: "center" }}>
            <button className={`chip ${notesOnly ? "chip-selected" : ""}`} aria-pressed={notesOnly} onClick={() => setNotesOnly(v => !v)} aria-label="Filter tasks that have notes" title="Filter: Notes">
              📝 Notes
            </button>
          </div>
          <div className="filter-group" style={{ alignSelf: "center" }}>
            <button className={`chip ${attachmentsOnly ? "chip-selected" : ""}`} aria-pressed={attachmentsOnly} onClick={() => setAttachmentsOnly(v => !v)} aria-label="Filter tasks that have attachments" title="Filter: Attachments">
              📎 Attachments
            </button>
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
        ) : tab === 'timeline' ? (
          <div className="timeline-tab" role="region" aria-label="Timeline day view">
            <div className="daily-toolbar">
              <div className="daily-progress">
                <div className="daily-progress-bar">
                  <div className="daily-progress-fill" style={{ width: `${Math.round((todayTotals?.rate || 0) * 100)}%` }} />
                </div>
                <div className="daily-progress-meta">Day timeline</div>
              </div>
              <div className="daily-quickadd" role="group" aria-label="Timeline date controls">
                <label className="sr-only" htmlFor="tl-date">Select date</label>
                <input
                  id="tl-date"
                  className="input"
                  type="date"
                  aria-label="Select date"
                  value={timelineDate}
                  onChange={(e) => setTimelineDate(e.target.value)}
                  style={{ maxWidth: 180 }}
                />
                <button className="btn btn-small" onClick={() => {
                  const d = new Date();
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  setTimelineDate(`${y}-${m}-${day}`);
                }} aria-label="Jump to today" title="Today">Today</button>
              </div>
            </div>
            {(() => {
              const dateObj = timelineDate ? new Date(timelineDate) : new Date();
              const tasksFiltered = selectorTasksForDay(
                filteredTodos,
                dateObj,
                { category: categoryFilter, priority: priorityFilter, due: dueFilter, notesOnly }
              );
              const conflicts = new Set((() => {
                const ids = new Set();
                for (let i = 0; i < tasksFiltered.length; i++) {
                  const a = tasksFiltered[i];
                  if (!a.startTime || !a.endTime) continue;
                  for (let j = i + 1; j < tasksFiltered.length; j++) {
                    const b = tasksFiltered[j];
                    if (!b.startTime || !b.endTime) continue;
                    const as = new Date(a.startTime).getTime();
                    const ae = new Date(a.endTime).getTime();
                    const bs = new Date(b.startTime).getTime();
                    const be = new Date(b.endTime).getTime();
                    if (Math.max(as, bs) < Math.min(ae, be)) { ids.add(a.id); ids.add(b.id); }
                  }
                }
                return Array.from(ids);
              })());
              return (
                <DayTimeline
                  date={dateObj}
                  tasks={tasksFiltered}
                  conflictIds={conflicts}
                  onSelectTask={(id) => {
                    const esc = (s) => (window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(s) : String(s).replace(/\"/g, '\\"'));
                    const title = tasksFiltered.find(t=>t.id===id)?.title || "";
                    const el = document.querySelector(`[aria-label="Task ${esc(title)}"]`);
                    if (el && typeof el.scrollIntoView === "function") {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                />
              );
            })()}
          </div>
        ) : (
          <TodoList
            todos={filteredTodos}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onUpdate={updateTodo}
          />
        )}
      </main>
      {toastMsg && (
        <div className="toast info" role="status" aria-live="polite" style={{ position: 'fixed', bottom: 16, right: 16 }}>
          <div className="toast-title">Update</div>
          <div className="toast-body">{toastMsg}</div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <CollaborationProvider>
      <AppInner />
    </CollaborationProvider>
  );
}

export default App;
