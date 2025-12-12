/**
 * useTodos hook manages to-do items with localStorage persistence by default.
 * If a backend is configured (via env), it attempts to sync with it but falls back gracefully.
 * Adds reminders, due dates, repeat schedules, and in-app notifications.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getApiBase } from "../utils/api";

const STORAGE_KEY = "todos_ocean_pro";

// Helpers for local persistence
function ensureDefaults(list) {
  // Backward compatibility: default missing fields
  return (Array.isArray(list) ? list : []).map((t) => ({
    ...t,
    category: t.category || "work",
    priority: t.priority || "medium",
    dueDate: typeof t.dueDate === "string" || t.dueDate === null ? t.dueDate : null,
    repeat: t.repeat || "none",
    remindAt: typeof t.remindAt === "string" || t.remindAt === null ? t.remindAt : null,
    lastNotifiedAt: t.lastNotifiedAt || null,
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

function generateLocalId() {
  return `local_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function isToday(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
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

// PUBLIC_INTERFACE
export function useTodos() {
  /** Hook that exposes todos state, notifications, and CRUD actions. */
  const [todos, setTodos] = useState(() => loadLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const hasBackend = useMemo(() => !!getApiBase(), []);
  const schedulerRef = useRef(null);

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
            setLoading(false);
            return;
          }
        } catch (e) {
          setError(e);
        }
      }
      // fallback to local
      if (isMounted) {
        setTodos(loadLocal());
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

  // Actions
  const addTodo = useCallback(async (title, category = "work", priority = "medium", dueDate = null, repeat = "none", remindAt = null) => {
    const baseTodo = {
      id: generateLocalId(),
      title: String(title).trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      category,
      priority,
      dueDate: dueDate || null,
      repeat: repeat || "none",
      remindAt: remindAt || null,
      lastNotifiedAt: null,
    };
    // optimistic update
    setTodos((prev) => [baseTodo, ...prev]);

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
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...ensureDefaults([updates])[0] } : t)));
    if (hasBackend) {
      try {
        await api.updateTodo(id, updates);
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend]);

  const toggleTodo = useCallback(async (id) => {
    setTodos((prev) => {
      return prev.map((t) => {
        if (t.id !== id) return t;
        const newCompleted = !t.completed;

        // If completing and has a repeat schedule, auto-schedule next
        if (newCompleted && t.repeat && t.repeat !== "none") {
          const nextDue = addRepeat(t.dueDate || new Date().toISOString(), t.repeat, t.remindAt || null);
          return {
            ...t,
            completed: newCompleted,
            dueDate: nextDue,
            lastNotifiedAt: null,
          };
        }
        return { ...t, completed: newCompleted };
      });
    });

    if (hasBackend) {
      try {
        const t = todos.find((x) => x.id === id);
        const newCompleted = !(t?.completed ?? false);
        const updates = { completed: newCompleted };
        // if this one is repeat and completed, also send dueDate shift
        if (t && newCompleted && t.repeat && t.repeat !== "none") {
          updates.dueDate = addRepeat(t.dueDate || new Date().toISOString(), t.repeat, t.remindAt || null);
          updates.lastNotifiedAt = null;
        }
        await api.updateTodo(id, updates);
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend, todos]);

  const deleteTodo = useCallback(async (id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (hasBackend) {
      try {
        await api.deleteTodo(id);
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend]);

  return {
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
  };
}
