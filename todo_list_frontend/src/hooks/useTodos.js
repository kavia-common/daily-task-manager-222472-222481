/**
 * useTodos hook manages to-do items with localStorage persistence by default.
 * If a backend is configured (via env), it attempts to sync with it but falls back gracefully.
 * Adds reminders, due dates, repeat schedules, in-app notifications, and productivity stats.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getApiBase } from "../utils/api";

const STORAGE_KEY = "todos_ocean_pro";
const STATS_KEY = "todo_stats_v1";

// Helpers for local persistence
function ensureDefaults(list) {
  // Backward compatibility: default missing fields (including new 'pinned' flag)
  return (Array.isArray(list) ? list : []).map((t) => ({
    ...t,
    category: t.category || "work",
    priority: t.priority || "medium",
    dueDate: typeof t.dueDate === "string" || t.dueDate === null ? t.dueDate : null,
    repeat: t.repeat || "none",
    remindAt: typeof t.remindAt === "string" || t.remindAt === null ? t.remindAt : null,
    lastNotifiedAt: t.lastNotifiedAt || null,
    // new metadata fields (backward compatible)
    completedAt: typeof t.completedAt === "string" || t.completedAt === null ? t.completedAt ?? null : null,
    createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
    // new pin flag
    pinned: typeof t.pinned === "boolean" ? t.pinned : false,
  }));
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

// PUBLIC_INTERFACE
export function useTodos() {
  /** Hook that exposes todos state, notifications, CRUD actions, and productivity stats. */
  const [todos, setTodos] = useState(() => loadLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const hasBackend = useMemo(() => !!getApiBase(), []);
  const schedulerRef = useRef(null);

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
  const addTodo = useCallback(async (title, category = "work", priority = "medium", dueDate = null, repeat = "none", remindAt = null, pinned = false) => {
    const nowIso = new Date().toISOString();
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
          // include pinned; backend may ignore it safely
          pinned: baseTodo.pinned,
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
    // ensure defaults on updates & avoid removing completedAt unintentionally
    const normalized = ensureDefaults([updates])[0];
    // keep pinned strictly boolean if provided
    if (typeof updates.pinned !== "undefined") {
      normalized.pinned = !!updates.pinned;
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
      return createdToday || dueToday;
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

    // PUBLIC_INTERFACE
    stats,
    /** Aggregate stats for today. */
    todayStats,
    /** All tasks that are due today or created today. */
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
  };
}
