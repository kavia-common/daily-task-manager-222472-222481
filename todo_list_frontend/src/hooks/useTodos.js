 /** 
  * useTodos hook manages to-do items with localStorage persistence and optional backend sync.
  * Enhanced with collaboration, gamification, auto-archive, and due-time reminders with accessible toasts.
  */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getApiBase } from "../utils/api";
import { useCollaboration } from "../components/CollaborationProvider";
import { useGamification } from "./useGamification";

const STORAGE_KEY = "todos_ocean_pro";
const STATS_KEY = "todo_stats_v1";
const QUICK_NOTES_KEY = "quick_notes_v1";
const FIVE_MIN = 5 * 60 * 1000;

function getSelfId() {
  const demo = typeof localStorage !== 'undefined' ? localStorage.getItem('demo_user_email') : null;
  const envId = process.env.REACT_APP_USER_EMAIL && process.env.REACT_APP_USER_EMAIL.trim();
  return (demo && demo.trim()) || envId || 'me';
}

// Helpers for local persistence and migration
function ensureDefaults(list) {
  return (Array.isArray(list) ? list : []).map((t) => {
    const owner = typeof t.owner === 'string' ? t.owner : getSelfId();
    const assignees = Array.isArray(t.assignees) ? t.assignees : [];
    const sharedWith = Array.isArray(t.sharedWith) ? t.sharedWith : [];
    const updatedAt = typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString();

    const startTime = typeof t.startTime === "string" ? t.startTime : null;
    const endTime = typeof t.endTime === "string" ? t.endTime : null;
    const norm = normalizeTimeRange(startTime, endTime);

    const attachments = Array.isArray(t.attachments) ? t.attachments : [];
    const normAtt = attachments.map((a) => ({
      id: a.id || `att_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      type: a.type === "audio" ? "audio" : "image",
      name: a.name || (a.type === "audio" ? "voice-note" : "image"),
      data: typeof a.data === "string" ? a.data : null,
      url: typeof a.url === "string" ? a.url : null,
      createdAt: typeof a.createdAt === "string" ? a.createdAt : new Date().toISOString(),
      size: typeof a.size === "number" ? a.size : undefined,
      durationSeconds: typeof a.durationSeconds === "number" ? a.durationSeconds : undefined,
    }));

    const archived = typeof t.archived === 'boolean' ? t.archived : false;
    const completedAt = typeof t.completedAt === "string" || t.completedAt === null ? (t.completedAt ?? null) : null;

    return ({
      ...t,
      owner,
      assignees,
      sharedWith,
      updatedAt,
      category: t.category || "work",
      priority: t.priority || "medium",
      dueDate: typeof t.dueDate === "string" || t.dueDate === null ? t.dueDate : null,
      repeat: t.repeat || "none",
      remindAt: typeof t.remindAt === "string" || t.remindAt === null ? t.remindAt : null,
      lastNotifiedAt: t.lastNotifiedAt || null,
      completedAt,
      archived,
      createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
      pinned: typeof t.pinned === "boolean" ? t.pinned : false,
      notes: Array.isArray(t.notes) ? t.notes : [],
      attachments: normAtt,
      dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
      startTime: norm.startTime,
      endTime: norm.endTime,
      rewards: typeof t.rewards === "object" && t.rewards ? {
        lastAwardedCompletionAt: typeof t.rewards.lastAwardedCompletionAt === "string" ? t.rewards.lastAwardedCompletionAt : null,
        totalPointsEarned: typeof t.rewards.totalPointsEarned === "number" ? t.rewards.totalPointsEarned : 0,
        lastCompletionOccurrenceId: typeof t.rewards.lastCompletionOccurrenceId === "string" ? t.rewards.lastCompletionOccurrenceId : null,
      } : { lastAwardedCompletionAt: null, totalPointsEarned: 0, lastCompletionOccurrenceId: null },
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
  } catch { /* ignore */ }
}

function loadQuickNotes() {
  try {
    const raw = localStorage.getItem(QUICK_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
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
  try { localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify(notes)); } catch {}
}

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateLocalId() {
  return `local_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function isSameLocalDate(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
export function normalizeTimeRange(startTime, endTime) {
  /** Ensures both times are either null or valid ISO and end >= start; auto-fix if needed. */
  if (!startTime && !endTime) return { startTime: null, endTime: null };
  try {
    const s = startTime ? new Date(startTime) : null;
    const e = endTime ? new Date(endTime) : null;
    if (!s && e) {
      const start = new Date(e.getTime() - 30 * 60000);
      return { startTime: start.toISOString(), endTime: e.toISOString() };
    } else if (s && !e) {
      const end = new Date(s.getTime() + 30 * 60000);
      return { startTime: s.toISOString(), endTime: end.toISOString() };
    } else if (s && e) {
      if (e.getTime() < s.getTime()) {
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

// Time utilities used by timeline
export function isTimeBlocked(task) {
  return !!(task && typeof task.startTime === "string" && typeof task.endTime === "string");
}
export function snapToFiveMinutes(iso) {
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
export function tasksForDay(list, date, filters) {
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

  return (Array.isArray(list) ? list : []).filter((t) => {
    let belongs = t.startTime && toKey(new Date(t.startTime)) === key;
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

function lastWriteWins(local, incoming) {
  if (!local) return incoming;
  if (!incoming) return local;
  return new Date(incoming.updatedAt || 0) >= new Date(local.updatedAt || 0) ? incoming : local;
}

// Stats
function loadStats() { try { const raw = localStorage.getItem(STATS_KEY); if (!raw) return null; return JSON.parse(raw); } catch { return null; } }
function saveStats(stats) { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {} }
function initStatsFromTodos(todos) {
  const stats = { daily: {}, lastProductiveDate: null, currentStreak: 0, bestStreak: 0, threshold: 1 };
  const toKeyFn = toKey;
  (todos || []).forEach((t) => {
    if (t.createdAt) {
      const kd = toKeyFn(new Date(t.createdAt));
      stats.daily[kd] = stats.daily[kd] || { created: 0, completed: 0 };
      stats.daily[kd].created += 1;
    }
    if (t.completed && t.completedAt) {
      const kc = toKeyFn(new Date(t.completedAt));
      stats.daily[kc] = stats.daily[kc] || { created: 0, completed: 0 };
      stats.daily[kc].completed += 1;
      stats.lastProductiveDate = kc;
    }
  });
  recomputeStreaks(stats);
  return stats;
}
function recomputeStreaks(stats) {
  const threshold = stats.threshold || 1;
  const today = new Date();
  let streak = 0;
  let best = stats.bestStreak || 0;
  for (let i = 0; i < 3650; i++) {
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

/**
 * Normalize a local-date (YYYY-MM-DD) range into inclusive ISO start/end covering entire local days.
 * If start or end is null, it will be treated as unbounded on that side.
 */
// PUBLIC_INTERFACE
export function normalizeDateRange(startDateStr, endDateStr) {
  /** Converts YYYY-MM-DD strings to ISO boundaries for local timezone full days. */
  function startOfDayISO(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    return dt.toISOString();
  }
  function endOfDayISO(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return dt.toISOString();
  }
  let startISO = null;
  let endISO = null;
  try {
    if (startDateStr) {
      const [y, m, dd] = String(startDateStr).split("-").map((s) => parseInt(s, 10));
      const d = new Date(y, (m - 1), dd, 0, 0, 0, 0);
      startISO = startOfDayISO(d);
    }
  } catch { startISO = null; }
  try {
    if (endDateStr) {
      const [y, m, dd] = String(endDateStr).split("-").map((s) => parseInt(s, 10));
      const d = new Date(y, (m - 1), dd, 23, 59, 59, 999);
      endISO = endOfDayISO(d);
    }
  } catch { endISO = null; }
  return { startISO, endISO };
}

// PUBLIC_INTERFACE
export function getCompletedTasksFromList(list, { includeArchived = true } = {}) {
  /** Returns all tasks completed (completed===true && completedAt) optionally filtering out archived. */
  const src = Array.isArray(list) ? list : [];
  const arr = src.filter((t) => t.completed && typeof t.completedAt === "string" && !!t.completedAt);
  return includeArchived ? arr : arr.filter((t) => !t.archived);
}

// PUBLIC_INTERFACE
export function getCompletedTasksByDateRangeFromList(list, startISO, endISO, { includeArchived = true } = {}) {
  /** Returns tasks completed between [startISO, endISO] inclusive (if provided). */
  const src = Array.isArray(list) ? list : [];
  return src.filter((t) => {
    if (!t.completed || !t.completedAt) return false;
    const c = new Date(t.completedAt).getTime();
    if (isNaN(c)) return false;
    if (!includeArchived && t.archived) return false;
    if (startISO) {
      const s = new Date(startISO).getTime();
      if (!isNaN(s) && c < s) return false;
    }
    if (endISO) {
      const e = new Date(endISO).getTime();
      if (!isNaN(e) && c > e) return false;
    }
    return true;
  });
}

// PUBLIC_INTERFACE
export function useTodos() {
  /** Hook that exposes todos, CRUD, collaboration integration, stats, and due reminders. */
  const [todos, setTodos] = useState(() => loadLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const hasBackend = useMemo(() => !!getApiBase(), []);
  const schedulerRef = useRef(null);

  // collaboration
  const { broadcast, on, EVENTS } = useCollaboration();
  const toastRef = useRef(null);
  const [collision, setCollision] = useState(null); // {id, remote, local}

  // quick notes
  const [quickNotes, setQuickNotes] = useState(() => loadQuickNotes());

  // stats
  const [stats, setStats] = useState(() => {
    const existing = loadStats();
    if (existing) return existing;
    const fromTodos = initStatsFromTodos(loadLocal());
    saveStats(fromTodos);
    return fromTodos;
  });

  // notifications settings (persisted)
  const NOTIF_SETTINGS_KEY = "notifications_settings_v1";
  const [notificationSettings, setNotificationSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(NOTIF_SETTINGS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { dueRemindersEnabled: true, lastViewFocusTaskId: null };
  });
  useEffect(() => {
    try { localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(notificationSettings)); } catch {}
  }, [notificationSettings]);

  // Initial load with backend attempt
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
            const normalized = ensureDefaults(data);
            setTodos(normalized);
            saveLocal(normalized);
            const newStats = initStatsFromTodos(normalized);
            setStats(newStats);
            saveStats(newStats);
            setLoading(false);
            return;
          }
        } catch (e) {
          setError(e);
        }
      }
      if (isMounted) {
        const localTodos = loadLocal();
        setTodos(localTodos);
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

  // Persist local
  useEffect(() => {
    saveLocal(todos);
  }, [todos]);

  // Persist stats/quick notes
  useEffect(() => { saveStats(stats); }, [stats]);
  useEffect(() => { saveQuickNotes(quickNotes); }, [quickNotes]);

  // Collaboration event listeners
  useEffect(() => {
    const offCreate = on(EVENTS.TASK_CREATED, ({ payload, _meta }) => {
      const remote = ensureDefaults([payload])[0];
      setTodos((prev) => {
        const exists = prev.find((t) => t.id === remote.id);
        if (!exists) return [remote, ...prev];
        return prev.map((t) => (t.id === remote.id ? lastWriteWins(t, remote) : t));
      });
      toastRef.current && toastRef.current(`Task updated by ${(_meta && _meta.sender) || 'someone'}`);
    });
    const offUpdate = on(EVENTS.TASK_UPDATED, ({ payload, _meta }) => {
      const remote = ensureDefaults([payload])[0];
      setTodos((prev) => {
        const loc = prev.find((t) => t.id === remote.id);
        if (loc && new Date(remote.updatedAt) < new Date(loc.updatedAt)) {
          return prev; // ignore stale
        }
        return prev.map((t) => (t.id === remote.id ? lastWriteWins(t, remote) : t));
      });
      toastRef.current && toastRef.current(`Task updated by ${(_meta && _meta.sender) || 'someone'}`);
    });
    const offDelete = on(EVENTS.TASK_DELETED, ({ payload }) => {
      setTodos((prev) => prev.filter((t) => t.id !== payload.id));
    });
    return () => {
      offCreate && offCreate();
      offUpdate && offUpdate();
      offDelete && offDelete();
    };
  }, [on, EVENTS]);

  // Toast helpers
  const pushToast = useCallback((kind, title, message, options = {}) => {
    const id = `toast_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const { actionLabel, onAction, autoFocusAction = false } = options || {};
    setToasts((prev) => [{ id, kind, title, message, actionLabel, onAction, autoFocusAction }, ...prev]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Auto-archive runner
  const archiveThresholdDays = 10;
  const runAutoArchive = useCallback(() => {
    let archivedCount = 0;
    const now = Date.now();
    const thresholdMs = archiveThresholdDays * 24 * 60 * 60 * 1000;
    setTodos((prev) => {
      const next = (prev || []).map((t) => {
        if (t.archived) return t;
        if (t.completed && t.completedAt) {
          const completedMs = new Date(t.completedAt).getTime();
          if (!isNaN(completedMs) && now - completedMs >= thresholdMs) {
            archivedCount += 1;
            return { ...t, archived: true, pinned: false, updatedAt: new Date().toISOString() };
          }
        }
        return t;
      });
      return next;
    });
    if (archivedCount > 0) {
      pushToast('info', 'Auto-archive', `${archivedCount} task${archivedCount > 1 ? 's' : ''} auto-archived`);
    }
  }, [archiveThresholdDays, pushToast]);

  useEffect(() => {
    runAutoArchive();
    const id = setInterval(runAutoArchive, 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [runAutoArchive]);

  // Helper to determine dependency-blocked state from current list
  const isBlocked = useCallback((task, list) => {
    if (!task || !Array.isArray(task.dependencies) || task.dependencies.length === 0) return false;
    const all = Array.isArray(list) ? list : [];
    for (const depId of task.dependencies) {
      const dep = all.find((x) => x.id === String(depId));
      if (!dep || !dep.completed) return true;
    }
    return false;
  }, []);

  // Due-time reminders scheduler with cooldown and 'due-now' check
  useEffect(() => {
    function evaluate() {
      const now = new Date();
      const nowMs = now.getTime();
      const cooldownMs = 30 * 60 * 1000;
      setTodos((prev) =>
        prev.map((t) => {
          if (!t) return t;
          if (typeof notificationSettings?.dueRemindersEnabled !== 'undefined' && !notificationSettings.dueRemindersEnabled) return t;
          if (t.archived || t.completed) return t;
          if (isBlocked(t, prev)) return t;

          const dueIso = t.remindAt && t.dueDate ? (() => {
            try {
              const d = new Date(t.dueDate);
              const [hh, mm] = String(t.remindAt).split(":").map((s) => parseInt(s, 10));
              if (!isNaN(hh)) d.setHours(hh || 0, mm || 0, 0, 0);
              return d.toISOString();
            } catch { return t.dueDate; }
          })() : t.dueDate;

          if (!dueIso) return t;
          const due = new Date(dueIso);
          const dueMs = due.getTime();
          const shouldDueNow = nowMs >= dueMs;
          const withinNextHour = dueMs > nowMs && dueMs <= (nowMs + 60 * 60 * 1000);
          if (!shouldDueNow && !withinNextHour) return t;

          const last = t.lastNotifiedAt ? new Date(t.lastNotifiedAt) : null;
          const tooSoon = last && (nowMs - last.getTime()) < cooldownMs;
          if (tooSoon) return t;

          const title = t.title || t.text || "Untitled";
          const kind = shouldDueNow ? "error" : "warn";
          const msg = shouldDueNow ? `Task due: ${title}` : `Upcoming: "${title}" at ${due.toLocaleTimeString()}`;
          const onAction = () => {
            try {
              const esc = (s) => (window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(s) : String(s).replace(/\"/g, '\\"'));
              const el = document.querySelector(`[aria-label="Task ${esc(title)}"]`);
              if (el && typeof el.scrollIntoView === "function") {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                const btn = el.parentElement?.querySelector('button, [role="button"], input, select, textarea');
                if (btn && typeof btn.focus === "function") btn.focus();
              }
            } catch {}
          };
          pushToast(kind, "Reminder", msg, { actionLabel: "View", onAction, autoFocusAction: true });
          return { ...t, lastNotifiedAt: now.toISOString() };
        })
      );
    }
    const id = setInterval(evaluate, 60000);
    evaluate();
    return () => clearInterval(id);
  }, [pushToast, notificationSettings, isBlocked]);

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
      recomputeStreaks(next);
      saveStats(next);
      return next;
    });
  }

  // Backend helpers
  const createRemote = useCallback(async (task) => { try { await api.createTodo(task); } catch {} }, []);
  const updateRemote = useCallback(async (id, updates) => { try { await api.updateTodo(id, updates); } catch {} }, []);
  const deleteRemote = useCallback(async (id) => { try { await api.deleteTodo(id); } catch {} }, []);

  // CRUD with collaboration
  const addTodo = useCallback(async (title, category = "work", priority = "medium", dueDate = null, repeat = "none", remindAt = null, pinned = false, startTime = null, endTime = null, dependencies = [], extras = {}) => {
    const now = new Date().toISOString();
    const owner = getSelfId();
    const newTodo = ensureDefaults([{
      id: generateLocalId(),
      title: String(title).trim() || String(extras.text || ''),
      text: undefined,
      completed: false,
      createdAt: now,
      category, priority, dueDate, repeat, remindAt,
      lastNotifiedAt: null,
      completedAt: null,
      pinned: !!pinned,
      startTime, endTime,
      notes: [],
      attachments: [],
      dependencies: Array.isArray(dependencies) ? dependencies.map(String) : [],
      owner,
      assignees: Array.isArray(extras.assignees) ? extras.assignees : [],
      sharedWith: Array.isArray(extras.sharedWith) ? extras.sharedWith : [],
      updatedAt: now,
    }])[0];

    setTodos((prev) => [newTodo, ...prev]);
    incrementCreated(now);

    // Gamification events on creation
    if (newTodo.startTime && newTodo.endTime) {
      recordTaskCreatedWithTimeBlock();
    }
    if ((newTodo.assignees && newTodo.assignees.length > 0) || (newTodo.sharedWith && newTodo.sharedWith.length > 0)) {
      recordTaskAssignedOrShared();
    }

    broadcast("task:created", newTodo);
    if (hasBackend) createRemote(newTodo);
  }, [broadcast, hasBackend, createRemote]);

  const updateTodo = useCallback(async (id, updates, opts = { detectCollision: true }) => {
    setTodos((prev) => {
      const current = prev.find((t) => t.id === id);
      if (!current) return prev;
      if (opts.detectCollision && updates && updates.expectedUpdatedAt && updates.expectedUpdatedAt !== current.updatedAt) {
        setCollision({ id, remote: current, local: { ...current, ...updates } });
        return prev;
      }
      let timePatched = {};
      if ("startTime" in updates || "endTime" in updates) {
        const norm = normalizeTimeRange(updates.startTime ?? null, updates.endTime ?? null);
        timePatched = { startTime: norm.startTime, endTime: norm.endTime };
      }
      const next = ensureDefaults([{ ...current, ...updates, ...timePatched, updatedAt: new Date().toISOString() }])[0];

      const prevHadTimeBlock = !!(current.startTime && current.endTime);
      const nextHasTimeBlock = !!(next.startTime && next.endTime);
      if (!prevHadTimeBlock && nextHasTimeBlock) {
        recordTaskCreatedWithTimeBlock();
      }
      const prevShareCount = (Array.isArray(current.assignees) ? current.assignees.length : 0) + (Array.isArray(current.sharedWith) ? current.sharedWith.length : 0);
      const nextShareCount = (Array.isArray(next.assignees) ? next.assignees.length : 0) + (Array.isArray(next.sharedWith) ? next.sharedWith.length : 0);
      if (nextShareCount > prevShareCount) {
        recordTaskAssignedOrShared();
      }
      const merged = prev.map((t) => (t.id === id ? next : t));
      broadcast("task:updated", next);
      if (hasBackend) updateRemote(id, next);
      return merged;
    });
  }, [broadcast, hasBackend, updateRemote]);

  const resolveCollision = useCallback((action) => {
    if (!collision) return;
    const { id, remote, local } = collision;
    if (action === 'reload') {
      setCollision(null);
      return;
    }
    const next = { ...remote, ...local, updatedAt: new Date().toISOString() };
    setTodos((prev) => prev.map((t) => (t.id === id ? next : t)));
    broadcast("task:updated", next);
    if (hasBackend) updateRemote(id, next);
    setCollision(null);
  }, [collision, broadcast, hasBackend, updateRemote]);

  // Gamification store
  const {
    state: gamification,
    recordCompletion,
    rollbackCompletion,
    recordTaskCreatedWithTimeBlock,
    recordTaskAssignedOrShared,
    recordFocusCompletion,
    recordUnblockedCompletion,
    getBadgeList,
    getLevelInfo,
    resetGamification,
  } = useGamification();

  const toggleTodo = useCallback(async (id) => {
    let toggledNow = null;
    setTodos((prev) => {
      const nowIso = new Date().toISOString();

      const isBlockedLocal = (task, list) => {
        if (!task || !Array.isArray(task.dependencies) || task.dependencies.length === 0) return false;
        const all = Array.isArray(list) ? list : [];
        for (const depId of task.dependencies) {
          const dep = all.find((x) => x.id === String(depId));
          if (!dep || !dep.completed) return true;
        }
        return false;
      };

      const mapped = prev.map((t) => {
        if (t.id !== id) return t;
        const newCompleted = !t.completed;

        const blockedBefore = !t.completed && isBlockedLocal(t, prev);

        let next = { ...t, completed: newCompleted, updatedAt: nowIso };
        if (newCompleted) {
          const newCompletedAt = nowIso;
          const hadSameDay = t.completedAt && isSameLocalDate(new Date(t.completedAt), new Date());
          next.completedAt = newCompletedAt;
          next.archived = false;
          if (!hadSameDay) incrementCompleted(newCompletedAt);

          const occurrenceId = newCompletedAt;
          const lastAwardedAt = t.rewards?.lastAwardedCompletionAt || null;
          if (lastAwardedAt !== occurrenceId) {
            const hasNotes = Array.isArray(t.notes) && t.notes.length > 0;
            const hasAtts = Array.isArray(t.attachments) && t.attachments.length > 0;
            const hasDeps = Array.isArray(t.dependencies) && t.dependencies.length > 0;

            const result = recordCompletion(
              { ...t, completedAt: newCompletedAt, _wasBlockedBeforeComplete: blockedBefore },
              { localAction: true }
            );

            next.rewards = {
              ...(t.rewards || {}),
              lastAwardedCompletionAt: occurrenceId,
              lastCompletionOccurrenceId: occurrenceId,
              totalPointsEarned: (t.rewards?.totalPointsEarned || 0) + (result.delta || 0),
            };

            if (blockedBefore) {
              recordUnblockedCompletion();
            }
            if (!hasNotes && !hasAtts && !hasDeps) {
              recordFocusCompletion();
            }

            if (result.leveledUp) {
              pushToast('info', 'Level Up!', `Great job! You've reached level ${getLevelInfo().level}.`);
            }
            if (Array.isArray(result.newBadges) && result.newBadges.length > 0) {
              result.newBadges.forEach(b => pushToast('info', 'New Badge', `You earned: ${b}`));
            }
          }
        } else {
          if (t.completedAt && isSameLocalDate(new Date(t.completedAt), new Date())) {
            decrementCompleted(t.completedAt);
          }
          if (t.rewards?.lastCompletionOccurrenceId) {
            rollbackCompletion(t.id, t.rewards.lastCompletionOccurrenceId);
          }
          next.completedAt = null;
          next.archived = false;
        }
        if (newCompleted && t.repeat && t.repeat !== "none") {
          const nextDue = addRepeat(t.dueDate || nowIso, t.repeat, t.remindAt || null);
          next.dueDate = nextDue;
          next.lastNotifiedAt = null;
        }
        toggledNow = next;
        return next;
      });
      return mapped;
    });
    if (toggledNow) {
      broadcast("task:updated", toggledNow);
      if (hasBackend) {
        try {
          const t = toggledNow;
          const updates = { completed: t.completed, completedAt: t.completedAt, dueDate: t.dueDate, lastNotifiedAt: t.lastNotifiedAt, updatedAt: t.updatedAt };
          await api.updateTodo(id, updates);
        } catch (e) { setError(e); }
      }
    }
  }, [broadcast, hasBackend]);

  const deleteTodo = useCallback(async (id) => {
    setTodos((prev) => {
      const toDelete = prev.find(t => t.id === id);
      if (toDelete?.completedAt && isSameLocalDate(new Date(toDelete.completedAt), new Date())) {
        decrementCompleted(toDelete.completedAt);
      }
      return prev.filter((t) => t.id !== id);
    });
    broadcast("task:deleted", { id });
    if (hasBackend) { try { await api.deleteTodo(id); } catch (e) { setError(e); } }
  }, [broadcast, hasBackend]);

  // Notes/attachments/dependencies helpers
  const addTaskNote = useCallback((taskId, note) => {
    setTodos(prev => prev.map(t => t.id === taskId ? { ...t, notes: [note, ...(Array.isArray(t.notes) ? t.notes : [])], updatedAt: new Date().toISOString() } : t));
    broadcast("task:updated", { ...(todos.find(x => x.id === taskId) || {}) });
  }, [broadcast, todos]);
  const updateTaskNote = useCallback((taskId, noteId, patch) => {
    setTodos(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const notes = (Array.isArray(t.notes) ? t.notes : []).map(n => n.id === noteId ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n);
      return { ...t, notes, updatedAt: new Date().toISOString() };
    }));
  }, []);
  const deleteTaskNote = useCallback((taskId, noteId) => {
    setTodos(prev => prev.map(t => t.id === taskId ? { ...t, notes: (Array.isArray(t.notes) ? t.notes : []).filter(n => n.id !== noteId), updatedAt: new Date().toISOString() } : t));
  }, []);
  const addAttachment = useCallback((taskId, attachment) => {
    setTodos(prev => prev.map(t => t.id === taskId ? { ...t, attachments: [attachment, ...(Array.isArray(t.attachments) ? t.attachments : [])], updatedAt: new Date().toISOString() } : t));
  }, []);
  const removeAttachment = useCallback((taskId, attachmentId) => {
    setTodos(prev => prev.map(t => t.id === taskId ? { ...t, attachments: (Array.isArray(t.attachments) ? t.attachments : []).filter(a => a.id !== attachmentId), updatedAt: new Date().toISOString() } : t));
  }, []);
  const replaceAttachmentMeta = useCallback((taskId, attachmentId, patch) => {
    setTodos(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const atts = (Array.isArray(t.attachments) ? t.attachments : []).map(a => a.id === attachmentId ? { ...a, ...patch } : a);
      return { ...t, attachments: atts, updatedAt: new Date().toISOString() };
    }));
  }, []);

  function prevSafeFind(list, id) {
    return (Array.isArray(list) ? list : []).find((t) => t.id === id) || null;
  }

  // Dependencies helpers
  function detectCycle(taskId, newDeps, list = todos) {
    const graph = new Map();
    const all = Array.isArray(list) ? list : [];
    all.forEach((t) => {
      graph.set(t.id, new Set(Array.isArray(t.dependencies) ? t.dependencies.map(String) : []));
    });
    if (!graph.has(taskId)) graph.set(taskId, new Set());
    graph.set(taskId, new Set((newDeps || []).map(String)));

    const visiting = new Set(); const visited = new Set();
    function dfs(node) {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      const nbrs = graph.get(node) || new Set();
      for (const n of nbrs) { if (dfs(n)) return true; }
      visiting.delete(node); visited.add(node); return false;
    }
    return dfs(taskId);
  }
  function setTaskDependencies(taskId, depIds) {
    const deps = Array.isArray(depIds) ? depIds.map(String) : [];
    if (deps.includes(taskId)) { pushToast("warn", "Invalid dependency", "A task cannot depend on itself."); return false; }
    const willCycle = detectCycle(taskId, deps, todos);
    if (willCycle) { pushToast("warn", "Cyclic dependency", "That change would create a cycle. Update rejected."); return false; }
    setTodos((prev) => prev.map((t) => (t.id === taskId ? { ...t, dependencies: deps, updatedAt: new Date().toISOString() } : t)));
    if (hasBackend) { api.updateTodo(taskId, { dependencies: deps }).catch(() => {}); }
    return true;
  }
  function addDependency(taskId, depId) {
    const t = todos.find((x) => x.id === taskId);
    if (!t) return false;
    const current = Array.isArray(t.dependencies) ? t.dependencies.map(String) : [];
    const next = Array.from(new Set([...current, String(depId)])).filter(Boolean);
    return setTaskDependencies(taskId, next);
  }
  function removeDependency(taskId, depId) {
    const t = todos.find((x) => x.id === taskId);
    if (!t) return false;
    const current = Array.isArray(t.dependencies) ? t.dependencies.map(String) : [];
    const next = current.filter((d) => d !== String(depId));
    return setTaskDependencies(taskId, next);
  }

  // Derived data
  const todaysTodos = useMemo(() => {
    const now = new Date();
    return (todos || []).filter((t) => {
      if (t.archived) return false;
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
  const last7Days = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const k = toKey(d);
      const s = stats.daily?.[k] || { created: 0, completed: 0 };
      const total = Math.max(1, s.created);
      const rate = s.created === 0 ? 0 : Math.min(1, s.completed / total);
      arr.push({ date: d, key: k, ...s, rate });
    }
    return arr;
  }, [stats]);
  const currentStreak = stats.currentStreak || 0;
  const bestStreak = stats.bestStreak || 0;
  const streakFactor = Math.min(currentStreak / 7, 1);
  const completionRateToday = todayTotals.rate;
  const weekRates = last7Days.map(d => d.rate);
  const sd = stdDev(weekRates);
  const consistencyFactor = Math.max(0, 1 - Math.min(sd, 1));
  const todayScore = Math.round((completionRateToday * 70) + (streakFactor * 20) + (consistencyFactor * 10));

  // Permission heuristic
  const canEdit = useCallback((task) => {
    const u = getSelfId();
    return task.owner === u || (task.assignees || []).includes(u) || (task.sharedWith || []).includes(u);
  }, []);

  // Archive helpers
  function restoreTask(taskId) {
    setTodos(prev => prev.map(t => t.id === taskId ? { ...t, archived: false, updatedAt: new Date().toISOString() } : t));
  }
  function purgeArchived(taskId) {
    setTodos(prev => prev.filter(t => !(t.id === taskId && t.archived)));
  }
  function purgeAllArchived() {
    setTodos(prev => prev.filter(t => !t.archived));
  }

  // History selectors bound to current todos list
  // PUBLIC_INTERFACE
  const getCompletedTasks = useCallback(
    (options = {}) => getCompletedTasksFromList(todos, options),
    [todos]
  );
  // PUBLIC_INTERFACE
  const getCompletedTasksByDateRange = useCallback(
    (startISO, endISO, options = {}) => getCompletedTasksByDateRangeFromList(todos, startISO, endISO, options),
    [todos]
  );

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
    // productivity
    todayTotals,
    todaysTodos,
    last7Days,
    currentStreak,
    bestStreak,
    todayScore,
    // quick notes
    quickNotes,
    addQuickNote: (note) => setQuickNotes(prev => [note, ...prev]),
    updateQuickNote: (id, patch) => setQuickNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)),
    deleteQuickNote: (id) => setQuickNotes(prev => prev.filter(n => n.id !== id)),
    addQuickChecklistItem: (noteId, text) => setQuickNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const item = { id: `ci_${Math.random().toString(36).slice(2)}_${Date.now()}`, text, done: false };
      const items = Array.isArray(n.items) ? [...n.items, item] : [item];
      return { ...n, checklist: true, items, updatedAt: new Date().toISOString() };
    })),
    toggleQuickChecklistItem: (noteId, itemId) => setQuickNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).map(it => it.id === itemId ? ({ ...it, done: !it.done }) : it);
      return { ...n, items, updatedAt: new Date().toISOString() };
    })),
    deleteQuickChecklistItem: (noteId, itemId) => setQuickNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const items = (n.items || []).filter(it => it.id !== itemId);
      return { ...n, items, updatedAt: new Date().toISOString() };
    })),
    // timeline helpers/selectors
    normalizeTimeRange,
    snapToFiveMinutes,
    tasksForDay: (date, filters) => tasksForDay(todos, date, filters),
    // history helpers/selectors
    normalizeDateRange,
    getCompletedTasks,
    getCompletedTasksByDateRange,
    // attachments and notes
    addAttachment,
    removeAttachment,
    replaceAttachmentMeta,
    addTaskNote,
    updateTaskNote,
    deleteTaskNote,
    // dependencies
    detectCycle,
    setTaskDependencies,
    addDependency,
    removeDependency,
    // collaboration helpers
    collision,
    resolveCollision,
    canEdit,
    setToastHandler: (fn) => { toastRef.current = fn; },
    // notifications settings
    notificationSettings,
    setNotificationSettings,
    // archive public helpers
    // PUBLIC_INTERFACE
    runAutoArchive,
    // PUBLIC_INTERFACE
    restoreTask,
    // PUBLIC_INTERFACE
    purgeArchived,
    // PUBLIC_INTERFACE
    purgeAllArchived,

    // Gamification exposure
    gamification,
    // PUBLIC_INTERFACE
    awardPoints: (delta, reason, taskId) => {
      return recordCompletion({ id: taskId, priority: "medium", completedAt: new Date().toISOString() }, { localAction: true, priorityBonus: false, streakBonus: false, dueBonus: false, unblockedBonus: false, timeBlockBonus: false, });
    },
    // PUBLIC_INTERFACE
    getBadgeList,
    // PUBLIC_INTERFACE
    getLevelInfo,
    // PUBLIC_INTERFACE
    resetGamification,
  };
}
