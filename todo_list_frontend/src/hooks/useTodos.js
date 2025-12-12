 /**
 * useTodos hook manages to-do items with localStorage persistence by default.
 * If a backend is configured (via env), it attempts to sync with it but falls back gracefully.
 * Adds reminders, due dates, repeat schedules, in-app notifications, and productivity stats.
 * Now extended with time blocking: startTime/endTime fields, timeline helpers, overlap detection.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getApiBase } from "../utils/api";

const STORAGE_KEY = "todos_ocean_pro";
const STATS_KEY = "todo_stats_v1";
const QUICK_NOTES_KEY = "quick_notes_v1";

const FIVE_MIN = 5 * 60 * 1000;

// Helpers for local persistence
function ensureDefaults(list) {
  // Backward compatibility: default missing fields (including new 'pinned' flag and notes array)
  return (Array.isArray(list) ? list : []).map((t) => {
    const startTime = typeof t.startTime === "string" ? t.startTime : null;
    const endTime = typeof t.endTime === "string" ? t.endTime : null;
    const normalized = normalizeTimeRange(startTime, endTime);
    return ({
      ...t,
      category: t.category || "work",
      priority: t.priority || "medium",
      dueDate: typeof t.dueDate === "string" || t.dueDate === null ? t.dueDate : null,
      repeat: t.repeat || "none",
      remindAt: typeof t.remindAt === "string" || t.remindAt === null ? t.remindAt : null,
      lastNotifiedAt: t.lastNotifiedAt || null,
      // new metadata fields (backward compatible)
      completedAt: typeof t.completedAt === "string" || t.completedAt === null ? (t.completedAt ?? null) : null,
      createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
      // new pin flag
      pinned: typeof t.pinned === "boolean" ? t.pinned : false,
      // new notes array
      notes: Array.isArray(t.notes) ? t.notes : [],
      // time blocking (start/end ISO or null)
      startTime: normalized.startTime,
      endTime: normalized.endTime,
    });
  });
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return ensureDefaults(parsed);
  } catch {
    return [];
  }
}
function saveLocal(todos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // ignore
  }
}

function loadQuickNotes() {
  try {
    const raw = localStorage.getItem(QUICK_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // normalize items array
    return (Array.isArray(parsed) ? parsed : []).map(n => ({
      id: n.id || `q_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      text: String(n.text || ""),
      body: typeof n.body === "string" ? n.body : "",
      createdAt: typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
      updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
      checklist: !!n.checklist,
      items: Array.isArray(n.items) ? n.items.map(it => ({
        id: it.id || `ci_${Math.random().toString(36).slice(2)}_${Date.now()}`,
        text: String(it.text || ""),
        done: !!it.done,
      })) : [],
    }));
  } catch {
    return [];
  }
}
function saveQuickNotes(notes) {
  try {
    localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify(notes));
  } catch {
    // ignore
  }
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

function generateLocalId() {
  return `local_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function isSameLocalDate(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(date) {
  const now = new Date();
  return isSameLocalDate(date, now);
}

function addRepeat(dueISO, repeat, keepTime = null) {
  if (!dueISO) return null;
  const d = new Date(dueISO);
  const out = new Date(d.getTime());
  if (repeat === "daily") out.setDate(out.getDate() + 1);
  else if (repeat === "weekly") out.setDate(out.getDate() + 7);
  else if (repeat === "monthly") out.setMonth(out.getMonth() + 1);
  if (keepTime && typeof keepTime === "string") {
    const [hh, mm] = keepTime.split(":").map((s) => parseInt(s, 10));
    out.setHours(hh || 0, mm || 0, 0, 0);
  }
  return out.toISOString();
}

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function initStatsFromTodos(todos) {
  // Build aggregates from current todos (migration safe)
  const stats = {
    daily: {}, // key -> { created, completed }
    lastProductiveDate: null,
    currentStreak: 0,
    bestStreak: 0,
    threshold: 1,
  };
  todos.forEach((t) => {
    if (t.createdAt) {
      const kd = toKey(new Date(t.createdAt));
      stats.daily[kd] = stats.daily[kd] || { created: 0, completed: 0 };
      stats.daily[kd].created += 1;
    }
    if (t.completed && t.completedAt) {
      const kc = toKey(new Date(t.completedAt));
      stats.daily[kc] = stats.daily[kc] || { created: 0, completed: 0 };
      stats.daily[kc].completed += 1;
      stats.lastProductiveDate = kc;
    }
  });
  // compute streaks
  recomputeStreaks(stats);
  return stats;
}

function recomputeStreaks(stats) {
  const threshold = stats.threshold || 1;
  const today = new Date();
  let streak = 0;
  let best = stats.bestStreak || 0;

  // walk backwards from today until a day that doesn't meet threshold
  for (let i = 0; i < 3650; i++) { // cap 10 years
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const k = toKey(d);
    const entry = stats.daily[k] || { created: 0, completed: 0 };
    if ((entry.completed || 0) >= threshold) {
      streak += 1;
      if (streak > best) best = streak;
    } else {
      break;
    }
  }
  stats.currentStreak = streak;
  stats.bestStreak = Math.max(best, stats.bestStreak || 0);
}

function stdDev(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

// Time blocking helpers
// PUBLIC_INTERFACE
export function isTimeBlocked(task) {
  /** Returns true if task has both startTime and endTime ISO strings. */
  return !!(task && typeof task.startTime === "string" && typeof task.endTime === "string");
}

// PUBLIC_INTERFACE
export function normalizeTimeRange(startTime, endTime) {
  /** Ensures both times are either null or valid ISO and end >= start; auto-fix if needed. */
  if (!startTime && !endTime) return { startTime: null, endTime: null };
  try {
    const s = startTime ? new Date(startTime) : null;
    const e = endTime ? new Date(endTime) : null;
    if (!s && e) {
      // if only end provided, set start = end - 30min
      const start = new Date(e.getTime() - 30 * 60000);
      return { startTime: start.toISOString(), endTime: e.toISOString() };
    } else if (s && !e) {
      // only start provided -> default 30 minutes
      const end = new Date(s.getTime() + 30 * 60000);
      return { startTime: s.toISOString(), endTime: end.toISOString() };
    } else if (s && e) {
      if (e.getTime() < s.getTime()) {
        // swap or adjust to 30min after
        const end = new Date(s.getTime() + 30 * 60000);
        return { startTime: s.toISOString(), endTime: end.toISOString() };
      }
      return { startTime: s.toISOString(), endTime: e.toISOString() };
    }
  } catch {
    return { startTime: null, endTime: null };
  }
  return { startTime: null, endTime: null };
}

// PUBLIC_INTERFACE
export function overlaps(a, b) {
  /** Returns true if two tasks with start/end overlap in time. */
  if (!isTimeBlocked(a) || !isTimeBlocked(b)) return false;
  const as = new Date(a.startTime).getTime();
  const ae = new Date(a.endTime).getTime();
  const bs = new Date(b.startTime).getTime();
  const be = new Date(b.endTime).getTime();
  return Math.max(as, bs) < Math.min(ae, be);
}

// PUBLIC_INTERFACE
export function getTasksForDate(list, date) {
  /** Returns tasks scheduled (startTime on the given date) with normalized ranges. */
  const key = toKey(date);
  return (Array.isArray(list) ? list : []).filter((t) => {
    if (!t.startTime) return false;
    try {
      const d = new Date(t.startTime);
      return toKey(d) === key;
    } catch {
      return false;
    }
  });
}

// PUBLIC_INTERFACE
export function snapToFiveMinutes(iso) {
  /** Snap a datetime ISO string to nearest 5-minute increment for consistent rendering. */
  try {
    const d = new Date(iso);
    const ms = d.getTime();
    const snapped = Math.round(ms / FIVE_MIN) * FIVE_MIN;
    const out = new Date(snapped);
    return out.toISOString();
  } catch {
    return iso;
  }
}

// PUBLIC_INTERFACE
export function tasksForDay(list, date, filters) {
  /** Returns filtered tasks for a day respecting provided filters (category, priority, due, notes, completion). */
  const key = toKey(date);
  const {
    category = "all",
    priority = "all",
    due = "all",
    notesOnly = false,
  } = (filters || {});

  const withinSameDay = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return d.getFullYear() === day.getFullYear() &&
      d.getMonth() === day.getMonth() &&
      d.getDate() === day.getDate();
  };
  const withinThisWeek = (iso) => {
    if (!iso) return false;
    const target = new Date(iso);
    const now = date;
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

  return (Array.isArray(list) ? list : [])
    .filter((t) => {
      // belongs to day if either startTime is that day or dueDate filter requests different slice later
      let belongs = t.startTime && toKey(new Date(t.startTime)) === key;
      // if no time blocking, still allow due-based membership when viewing a day
      if (!belongs && t.dueDate && withinSameDay(t.dueDate)) {
        belongs = true;
      }
      if (!belongs) return false;

      const tCat = t.category || "work";
      const tPri = t.priority || "medium";
      const okCat = category === "all" ? true : tCat === category;
      const okPri = priority === "all" ? true : tPri === priority;

      let okDue = true;
      if (due === "today") okDue = !!t.dueDate && withinSameDay(t.dueDate);
      else if (due === "week") okDue = !!t.dueDate && withinThisWeek(t.dueDate);
      else if (due === "overdue") okDue = isOverdue(t.dueDate, t.completed);

      const okNotes = notesOnly ? Array.isArray(t.notes) && t.notes.length > 0 : true;
      return okCat && okPri && okDue && okNotes;
    });
}

// PUBLIC_INTERFACE
export function detectConflicts(list) {
  /** Returns a Set of taskIds that have overlapping time ranges among time-blocked tasks. */
  const conflicts = new Set();
  const timeTasks = (Array.isArray(list) ? list : []).filter(isTimeBlocked);
  for (let i = 0; i < timeTasks.length; i++) {
    for (let j = i + 1; j < timeTasks.length; j++) {
      if (toKey(new Date(timeTasks[i].startTime)) !== toKey(new Date(timeTasks[j].startTime))) continue;
      if (overlaps(timeTasks[i], timeTasks[j])) {
        conflicts.add(timeTasks[i].id);
        conflicts.add(timeTasks[j].id);
      }
    }
  }
  return conflicts;
}

// PUBLIC_INTERFACE
export function useTodos() {
  /** Hook that exposes todos state, notifications, CRUD actions, productivity stats, and time blocking helpers. */
  const [todos, setTodos] = useState(() => loadLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const hasBackend = useMemo(() => !!getApiBase(), []);
  const schedulerRef = useRef(null);

  // quick notes state
  const [quickNotes, setQuickNotes] = useState(() => loadQuickNotes());

  // stats state
  const [stats, setStats] = useState(() => {
    const existing = loadStats();
    if (existing) return existing;
    const fromTodos = initStatsFromTodos(loadLocal());
    saveStats(fromTodos);
    return fromTodos;
  });

  // Initial load
  useEffect(() => {
    let isMounted = true;
    async function init() {
      setLoading(true);
      setError(null);
      if (hasBackend) {
        try {
          const data = await api.listTodos();
          if (data && Array.isArray(data)) {
            if (!isMounted) return;
            const withDefaults = ensureDefaults(data);
            setTodos(withDefaults);
            saveLocal(withDefaults); // keep a local cache
            // refresh stats from loaded todos if no stats exist yet
            const newStats = initStatsFromTodos(withDefaults);
            setStats(newStats);
            saveStats(newStats);
            setLoading(false);
            return;
          }
        } catch (e) {
          setError(e);
        }
      }
      // fallback to local
      if (isMounted) {
        const localTodos = loadLocal();
        setTodos(localTodos);
        // ensure stats exists
        const existing = loadStats();
        if (!existing) {
          const s = initStatsFromTodos(localTodos);
          setStats(s);
          saveStats(s);
        }
        setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [hasBackend]);

  // Persist to localStorage whenever todos change
  useEffect(() => {
    saveLocal(todos);
  }, [todos]);

  // Persist stats
  useEffect(() => {
    saveStats(stats);
  }, [stats]);

  // Persist quick notes
  useEffect(() => {
    saveQuickNotes(quickNotes);
  }, [quickNotes]);

  // Toast helpers
  const pushToast = useCallback((kind, title, message) => {
    const id = `toast_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    setToasts((prev) => [{ id, kind, title, message }, ...prev]);
    // auto dismiss after 6s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);
  // PUBLIC_INTERFACE
  const dismissToast = useCallback((id) => {
    /** Dismiss a toast by id. */
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Evaluate reminders every 60s
  useEffect(() => {
    function evaluate() {
      const now = new Date();
      const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
      setTodos((prev) => {
        const updated = prev.map((t) => {
          if (!t.dueDate || t.completed) return t;
          const due = new Date(t.dueDate);
          const dueToday = isToday(due);
          const overdue = now > due;

          let shouldNotify = false;
          let notifyKind = "info";
          let notifyMsg = "";

          if (overdue) {
            notifyKind = "error";
            notifyMsg = `Task "${t.title}" is overdue since ${due.toLocaleString()}`;
            shouldNotify = true;
          } else if (dueToday && due > now && due <= nextHour) {
            notifyKind = "warn";
            notifyMsg = `Task "${t.title}" is due within the next hour (${due.toLocaleTimeString()})`;
            shouldNotify = true;
          }

          if (!shouldNotify) return t;

          // Avoid duplicate within the same hour
          const last = t.lastNotifiedAt ? new Date(t.lastNotifiedAt) : null;
          const tooSoon = last && (now.getTime() - last.getTime()) < 60 * 60 * 1000;
          if (tooSoon) return t;

          pushToast(notifyKind, "Reminder", notifyMsg);
          return { ...t, lastNotifiedAt: now.toISOString() };
        });
        return updated;
      });
    }

    // start interval
    evaluate();
    if (schedulerRef.current) clearInterval(schedulerRef.current);
    schedulerRef.current = setInterval(evaluate, 60000);
    return () => {
      if (schedulerRef.current) clearInterval(schedulerRef.current);
    };
  }, [pushToast]);

  // Stats helpers
  function incrementCreated(dateIso) {
    const d = new Date(dateIso || new Date().toISOString());
    const k = toKey(d);
    setStats((prev) => {
      const daily = { ...(prev.daily || {}) };
      daily[k] = daily[k] || { created: 0, completed: 0 };
      daily[k].created += 1;
      const next = { ...prev, daily };
      saveStats(next);
      return next;
    });
  }
  function incrementCompleted(dateIso) {
    const d = new Date(dateIso || new Date().toISOString());
    const k = toKey(d);
    setStats((prev) => {
      const daily = { ...(prev.daily || {}) };
      daily[k] = daily[k] || { created: 0, completed: 0 };
      daily[k].completed += 1;
      const next = { ...prev, daily, lastProductiveDate: k };
      recomputeStreaks(next);
      saveStats(next);
      return next;
    });
  }
  function decrementCompleted(dateIso) {
    const d = new Date(dateIso || new Date().toISOString());
    const k = toKey(d);
    setStats((prev) => {
      const daily = { ...(prev.daily || {}) };
      daily[k] = daily[k] || { created: 0, completed: 0 };
      daily[k].completed = Math.max(0, (daily[k].completed || 0) - 1);
      const next = { ...prev, daily };
      // Recompute streak as unchecking may break it
      recomputeStreaks(next);
      saveStats(next);
      return next;
    });
  }

  // Actions
  const addTodo = useCallback(async (title, category = "work", priority = "medium", dueDate = null, repeat = "none", remindAt = null, pinned = false, startTime = null, endTime = null) => {
    const nowIso = new Date().toISOString();
    // snap optional times
    const norm = normalizeTimeRange(startTime, endTime);
    const baseTodo = {
      id: generateLocalId(),
      title: String(title).trim(),
      completed: false,
      createdAt: nowIso,
      category,
      priority,
      dueDate: dueDate || null,
      repeat: repeat || "none",
      remindAt: remindAt || null,
      lastNotifiedAt: null,
      completedAt: null,
      pinned: !!pinned,
      startTime: norm.startTime,
      endTime: norm.endTime,
      notes: [],
    };
    // optimistic update
    setTodos((prev) => [baseTodo, ...prev]);
    incrementCreated(nowIso);

    if (hasBackend) {
      try {
        const created = await api.createTodo({
          title: baseTodo.title,
          completed: baseTodo.completed,
          category: baseTodo.category,
          priority: baseTodo.priority,
          dueDate: baseTodo.dueDate,
          repeat: baseTodo.repeat,
          remindAt: baseTodo.remindAt,
          lastNotifiedAt: baseTodo.lastNotifiedAt,
          createdAt: baseTodo.createdAt,
          completedAt: baseTodo.completedAt,
          pinned: baseTodo.pinned,
          notes: [],
          startTime: baseTodo.startTime,
          endTime: baseTodo.endTime,
        });
        if (created && created.id) {
          // reconcile: replace local id with server id
          const normalized = ensureDefaults([created])[0];
          setTodos((prev) =>
            prev.map((t) => (t.id === baseTodo.id ? { ...normalized } : t))
          );
        }
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend]);

  const updateTodo = useCallback(async (id, updates) => {
    // normalize time updates if present
    let timePatched = {};
    if ("startTime" in updates || "endTime" in updates) {
      const norm = normalizeTimeRange(updates.startTime ?? null, updates.endTime ?? null);
      timePatched = { startTime: norm.startTime, endTime: norm.endTime };
    }
    const normalized = ensureDefaults([{ ...updates, ...timePatched }])[0];
    // keep pinned strictly boolean if provided
    if (typeof updates.pinned !== "undefined") {
      normalized.pinned = !!updates.pinned;
    }
    if (typeof normalized.startTime === "string") {
      normalized.startTime = snapToFiveMinutes(normalized.startTime);
    }
    if (typeof normalized.endTime === "string") {
      normalized.endTime = snapToFiveMinutes(normalized.endTime);
    }
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...normalized } : t)));
    if (hasBackend) {
      try {
        await api.updateTodo(id, normalized);
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend]);

  const toggleTodo = useCallback(async (id) => {
    let toggled;
    setTodos((prev) => {
      const nowIso = new Date().toISOString();
      const mapped = prev.map((t) => {
        if (t.id !== id) return t;
        const newCompleted = !t.completed;
        let next = { ...t, completed: newCompleted };
        // set completion timestamp metadata
        if (newCompleted) {
          // avoid double counting within a day: only increment if no completedAt today
          const newCompletedAt = nowIso;
          const hadSameDay = t.completedAt && isSameLocalDate(new Date(t.completedAt), new Date());
          next.completedAt = newCompletedAt;
          if (!hadSameDay) incrementCompleted(newCompletedAt);
        } else {
          // unchecking should decrement if it was completed today
          if (t.completedAt && isSameLocalDate(new Date(t.completedAt), new Date())) {
            decrementCompleted(t.completedAt);
          }
          next.completedAt = null;
        }

        // If completing and has a repeat schedule, auto-schedule next
        if (newCompleted && t.repeat && t.repeat !== "none") {
          const nextDue = addRepeat(t.dueDate || nowIso, t.repeat, t.remindAt || null);
          next.dueDate = nextDue;
          next.lastNotifiedAt = null;
        }
        toggled = next;
        return next;
      });
      return mapped;
    });

    if (hasBackend) {
      try {
        const t = todos.find((x) => x.id === id);
        const newCompleted = !(t?.completed ?? false);
        const nowIso = new Date().toISOString();
        const updates = { completed: newCompleted };
        // optional completion timestamp propagation
        updates.completedAt = newCompleted ? nowIso : null;
        if (t && newCompleted && t.repeat && t.repeat !== "none") {
          updates.dueDate = addRepeat(t.dueDate || nowIso, t.repeat, t.remindAt || null);
          updates.lastNotifiedAt = null;
        }
        await api.updateTodo(id, updates);
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend, todos]);

  const deleteTodo = useCallback(async (id) => {
    // If deleting a completed today item, adjust stats to avoid stale counts
    setTodos((prev) => {
      const toDelete = prev.find(t => t.id === id);
      if (toDelete?.completedAt && isSameLocalDate(new Date(toDelete.completedAt), new Date())) {
        decrementCompleted(toDelete.completedAt);
      }
      return prev.filter((t) => t.id !== id);
    });
    if (hasBackend) {
      try {
        await api.deleteTodo(id);
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend]);

  // Derived data for Today view
  const todayKey = toKey(new Date());
  const todayStats = stats.daily?.[todayKey] || { created: 0, completed: 0 };
  const todaysTodos = useMemo(() => {
    const now = new Date();
    return (todos || []).filter((t) => {
      const createdToday = t.createdAt && isSameLocalDate(new Date(t.createdAt), now);
      const dueToday = t.dueDate && isSameLocalDate(new Date(t.dueDate), now);
      const startToday = t.startTime && isSameLocalDate(new Date(t.startTime), now);
      return createdToday || dueToday || startToday;
    });
  }, [todos]);

  const todayTotals = useMemo(() => {
    const total = todaysTodos.length;
    const completed = todaysTodos.filter(t => t.completed).length;
    const rate = total > 0 ? completed / total : 0;
    return { total, completed, rate };
  }, [todaysTodos]);

  // Weekly summary last 7 days
  const last7Days = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const k = toKey(d);
      const s = stats.daily?.[k] || { created: 0, completed: 0 };
      const total = Math.max(1, s.created); // avoid NaN for rate calc
      const rate = s.created === 0 ? 0 : Math.min(1, s.completed / total);
      arr.push({ date: d, key: k, ...s, rate });
    }
    return arr;
  }, [stats]);

  // Productivity score calculations
  const currentStreak = stats.currentStreak || 0;
  const bestStreak = stats.bestStreak || 0;

  const streakFactor = Math.min(currentStreak / 7, 1);
  const completionRateToday = todayTotals.rate;
  const weekRates = last7Days.map(d => d.rate);
  const sd = stdDev(weekRates);
  const consistencyFactor = Math.max(0, 1 - Math.min(sd, 1)); // low variance -> closer to 1

  const todayScore = Math.round((completionRateToday * 70) + (streakFactor * 20) + (consistencyFactor * 10));
  const weekAvgRate = weekRates.reduce((a, b) => a + b, 0) / (weekRates.length || 1);
  const weekScore = Math.round((weekAvgRate * 70) + (streakFactor * 20) + (consistencyFactor * 10));

  // Sorter to place pinned items at the top while preserving relative order otherwise
  function sortPinnedFirst(list) {
    const arr = Array.isArray(list) ? [...list] : [];
    return arr.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap; // pinned first
      return 0;
    });
  }

  // PUBLIC_INTERFACE
  const addTaskNote = useCallback((taskId, note) => {
    /** Add a note to a specific task by ID. */
    setTodos(prev => prev.map(t => t.id === taskId ? { ...t, notes: [note, ...(Array.isArray(t.notes) ? t.notes : [])] } : t));
    if (hasBackend) {
      // Try to update backend if supported; ignore failures gracefully
      api.updateTodo(taskId, { notes: undefined }).catch(() => {});
    }
  }, [hasBackend]);

  // PUBLIC_INTERFACE
  const updateTaskNote = useCallback((taskId, noteId, patch) => {
    /** Update a note on a task by IDs with shallow patch. */
    setTodos(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const notes = (Array.isArray(t.notes) ? t.notes : []).map(n => n.id === noteId ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n);
      return { ...t, notes };
    }));
    if (hasBackend) api.updateTodo(taskId, { notes: undefined }).catch(() => {});
  }, [hasBackend]);

  // PUBLIC_INTERFACE
  const deleteTaskNote = useCallback((taskId, noteId) => {
    /** Delete a note from a task by IDs. */
    setTodos(prev => prev.map(t => t.id === taskId ? { ...t, notes: (Array.isArray(t.notes) ? t.notes : []).filter(n => n.id !== noteId) } : t));
    if (hasBackend) api.updateTodo(taskId, { notes: undefined }).catch(() => {});
  }, [hasBackend]);

  // PUBLIC_INTERFACE
  const addChecklistItem = useCallback((taskId, noteId, itemText) => {
    /** Add a checklist item to a task note. */
    setTodos(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const notes = (t.notes || []).map(n => {
        if (n.id !== noteId) return n;
        const item = { id: `ci_${Math.random().toString(36).slice(2)}_${Date.now()}`, text: itemText, done: false };
        const items = Array.isArray(n.items) ? [...n.items, item] : [item];
        return { ...n, checklist: true, items, updatedAt: new Date().toISOString() };
      });
      return { ...t, notes };
    }));
    if (hasBackend) api.updateTodo(taskId, { notes: undefined }).catch(() => {});
  }, [hasBackend]);

  // PUBLIC_INTERFACE
  const toggleChecklistItem = useCallback((taskId, noteId, itemId) => {
    /** Toggle a checklist item done state. */
    setTodos(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const notes = (t.notes || []).map(n => {
        if (n.id !== noteId) return n;
        const items = (n.items || []).map(it => it.id === itemId ? ({ ...it, done: !it.done }) : it);
        return { ...n, items, updatedAt: new Date().toISOString() };
      });
      return { ...t, notes };
    }));
    if (hasBackend) api.updateTodo(taskId, { notes: undefined }).catch(() => {});
  }, [hasBackend]);

  // PUBLIC_INTERFACE
  const deleteChecklistItem = useCallback((taskId, noteId, itemId) => {
    /** Delete a checklist item from a note. */
    setTodos(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const notes = (t.notes || []).map(n => {
        if (n.id !== noteId) return n;
        const items = (n.items || []).filter(it => it.id !== itemId);
        return { ...n, items, updatedAt: new Date().toISOString() };
      });
      return { ...t, notes };
    }));
    if (hasBackend) api.updateTodo(taskId, { notes: undefined }).catch(() => {});
  }, [hasBackend]);

  // Quick Notes handlers
  // PUBLIC_INTERFACE
  const addQuickNote = useCallback((note) => {
    /** Add a global quick note. */
    setQuickNotes(prev => [note, ...prev]);
  }, []);
  // PUBLIC_INTERFACE
  const updateQuickNote = useCallback((id, patch) => {
    /** Update a global quick note by id. */
    setQuickNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n));
  }, []);
  // PUBLIC_INTERFACE
  const deleteQuickNote = useCallback((id) => {
    /** Delete a global quick note by id. */
    setQuickNotes(prev => prev.filter(n => n.id !== id));
  }, []);
  // PUBLIC_INTERFACE
  const addQuickChecklistItem = useCallback((noteId, text) => {
    /** Add an item to a quick checklist note. */
    setQuickNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const item = { id: `ci_${Math.random().toString(36).slice(2)}_${Date.now()}`, text, done: false };
      const items = Array.isArray(n.items) ? [...n.items, item] : [item];
      return { ...n, checklist: true, items, updatedAt: new Date().toISOString() };
    }));
  }, []);
  // PUBLIC_INTERFACE
  const toggleQuickChecklistItem = useCallback((noteId, itemId) => {
    /** Toggle a quick checklist note item. */
    setQuickNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).map(it => it.id === itemId ? ({ ...it, done: !it.done }) : it);
      return { ...n, items, updatedAt: new Date().toISOString() };
    }));
  }, []);
  // PUBLIC_INTERFACE
  const deleteQuickChecklistItem = useCallback((noteId, itemId) => {
    /** Delete an item from a quick checklist note. */
    setQuickNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).filter(it => it.id !== itemId);
      return { ...n, items, updatedAt: new Date().toISOString() };
    }));
  }, []);

  // Selectors for timeline
  // PUBLIC_INTERFACE
  const conflictsForSelected = useCallback((date, filters) => {
    /** Returns Set of conflicting task IDs for a given day and filter set. */
    const dayTasks = tasksForDay(todos, date, filters);
    return detectConflicts(dayTasks);
  }, [todos]);

  return {
    todos: sortPinnedFirst(todos),
    loading,
    error,
    addTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    hasBackend,
    toasts,
    dismissToast,

    // Task note handlers
    addTaskNote,
    updateTaskNote,
    deleteTaskNote,
    addChecklistItem,
    toggleChecklistItem,
    deleteChecklistItem,

    // Quick notes state + handlers
    quickNotes,
    addQuickNote,
    updateQuickNote,
    deleteQuickNote,
    addQuickChecklistItem,
    toggleQuickChecklistItem,
    deleteQuickChecklistItem,

    // PUBLIC_INTERFACE
    stats,
    /** Aggregate stats for today. */
    todayStats,
    /** All tasks that are due today or created today (or start today). */
    todaysTodos,
    /** Today totals with completion rate. */
    todayTotals,
    /** Last 7 days array with created, completed, and rate per day. */
    last7Days,
    /** Current streak and best streak. */
    currentStreak,
    bestStreak,
    /** Productivity scores for today and week. */
    todayScore,
    weekScore,

    // Time blocking helpers/selectors
    /** Utility: normalize a time range object. */
    normalizeTimeRange,
    /** Utility: snap a time ISO string to nearest 5 minutes. */
    snapToFiveMinutes,
    /** Selector: tasks scheduled for a given date with filters. */
    tasksForDay: (date, filters) => tasksForDay(todos, date, filters),
    /** Conflict detection: Set of IDs overlapping among tasks for date/filters. */
    conflictsForSelected,
  };
}
