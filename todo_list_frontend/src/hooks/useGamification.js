import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBase, api as apiClient } from "../utils/api";

const GAMIFICATION_KEY = "gamification_v1";

/**
 * Default state for gamification store.
 */
function defaultState() {
  return {
    points: 0,
    level: 1,
    nextLevelAt: 100, // 100 * level
    xp: 0, // alias to points; kept for extensibility
    badges: [],
    lastEarnedAt: null,
    history: [], // { id, taskId, delta, reason, at }
    totals: {
      completedTasks: 0,
      completedBeforeDue: 0,
      createdTimeBlocked: 0,
      sharedAssigned: 0,
      focusNoNotesDepsAtt: 0,
      unblockedCompleted: 0,
      completionsByDay: {}, // dateKey -> count
      completionsByWeek: {}, // weekKey -> count
    },
    config: {
      awardOnLocalActionsOnly: true,
    },
  };
}

/**
 * Migration support - keep backward compatibility with possible existing stats.
 * For now we only ensure shape, leaving stats in place.
 */
function migrate(raw) {
  if (!raw || typeof raw !== "object") return defaultState();
  const base = defaultState();
  const next = {
    ...base,
    ...raw,
    points: typeof raw.points === "number" ? raw.points : (typeof raw.xp === "number" ? raw.xp : 0),
    xp: typeof raw.xp === "number" ? raw.xp : (typeof raw.points === "number" ? raw.points : 0),
    level: typeof raw.level === "number" ? raw.level : 1,
    nextLevelAt: typeof raw.nextLevelAt === "number" ? raw.nextLevelAt : 100,
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    totals: typeof raw.totals === "object" && raw.totals ? { ...base.totals, ...raw.totals } : base.totals,
    config: typeof raw.config === "object" && raw.config ? { ...base.config, ...raw.config } : base.config,
  };
  // ensure thresholds coherence
  next.nextLevelAt = 100 * next.level;
  return next;
}

function load() {
  try {
    const raw = localStorage.getItem(GAMIFICATION_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}
function save(state) {
  try { localStorage.setItem(GAMIFICATION_KEY, JSON.stringify(state)); } catch {}
}

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toWeekKey(d) {
  // week starting on Sunday
  const day = d.getDay();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return `${start.getFullYear()}-W${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`;
}

function computeNextLevelThreshold(level) {
  return 100 * level;
}
function applyLeveling(prev, add) {
  let points = Math.max(0, (prev.points || 0) + add);
  let level = prev.level || 1;
  let nextLevelAt = computeNextLevelThreshold(level);
  let leveledUp = false;
  while (points >= nextLevelAt) {
    leveledUp = true;
    points = points - nextLevelAt;
    level += 1;
    nextLevelAt = computeNextLevelThreshold(level);
  }
  return { points, xp: points, level, nextLevelAt, leveledUp };
}

function ensureUnique(arr) {
  return Array.from(new Set(arr));
}

// PUBLIC_INTERFACE
export function useGamification() {
  /**
   * Gamification store with points, levels, and badges.
   * Exposes:
   * - state: { points, level, nextLevelAt, badges, history, totals }
   * - awardPoints(delta, reason, taskId)
   * - recordCompletion(task, options) with awarding rules and idempotency
   * - rollbackCompletion(taskId, occurrenceId)
   * - recordTaskCreatedWithTimeBlock()
   * - recordTaskAssignedOrShared()
   * - recordFocusCompletion()
   * - recordUnblockedCompletion()
   * - getBadgeList()
   * - getLevelInfo()
   * - resetGamification()
   */
  const [state, setState] = useState(() => load());
  const hasBackend = useMemo(() => !!getApiBase(), []);

  useEffect(() => {
    save(state);
    // optional backend propagation (best-effort, ignore failures)
    if (hasBackend) {
      // noop unless backend supports it; we just try and ignore error
      apiClient && apiClient.gamificationSync && apiClient.gamificationSync(state).catch(() => {});
    }
  }, [state, hasBackend]);

  const getLevelInfo = useCallback(() => {
    const pct = Math.min(100, Math.round(((state.points || 0) / (state.nextLevelAt || 100)) * 100));
    return { level: state.level, points: state.points, nextLevelAt: state.nextLevelAt, progressPercent: pct };
  }, [state.level, state.points, state.nextLevelAt]);

  const getBadgeList = useCallback(() => {
    return Array.isArray(state.badges) ? state.badges : [];
  }, [state.badges]);

  const pushHistory = useCallback((arr, entry) => {
    const id = `h_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    return [{ id, ...entry }, ...arr].slice(0, 500);
  }, []);

  const awardPoints = useCallback((delta, reason, taskId = null) => {
    if (!delta || delta === 0) return { leveledUp: false, newBadge: null };
    setState((prev) => {
      const { points, xp, level, nextLevelAt, leveledUp } = applyLeveling(prev, delta);
      const updated = {
        ...prev,
        points,
        xp,
        level,
        nextLevelAt,
        lastEarnedAt: new Date().toISOString(),
        history: pushHistory(prev.history || [], { taskId, delta, reason, at: new Date().toISOString() }),
      };
      return updated;
    });
    return { leveledUp: false, newBadge: null }; // actual toast decisions are done by caller
  }, [pushHistory]);

  // Badge evaluation helper
  const evaluateBadges = useCallback((nextTotals, prevBadges) => {
    const earned = new Set(prevBadges || []);
    // "First Steps": complete 1 task
    if ((nextTotals?.completedTasks || 0) >= 1) earned.add("First Steps");
    // "Consistency": complete tasks 7 days in a row
    // We'll interpret as 7-day streak with at least 1 completion per day
    // We can compute streak from totals.completionsByDay
    const byDay = nextTotals?.completionsByDay || {};
    let streak = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = toKey(d);
      const c = byDay[k] || 0;
      if (c > 0) streak += 1;
      else break;
    }
    if (streak >= 7) earned.add("Consistency");
    // "Power Week": complete 25 tasks in a week
    const thisWeekKey = toWeekKey(new Date());
    if ((nextTotals?.completionsByWeek?.[thisWeekKey] || 0) >= 25) earned.add("Power Week");
    // "Deadline Hero": complete 10 tasks before due time
    if ((nextTotals?.completedBeforeDue || 0) >= 10) earned.add("Deadline Hero");
    // "Planner": create 10 time-blocked tasks
    if ((nextTotals?.createdTimeBlocked || 0) >= 10) earned.add("Planner");
    // "Collaborator": assign/share 5 tasks
    if ((nextTotals?.sharedAssigned || 0) >= 5) earned.add("Collaborator");
    // "Focus Master": complete 5 tasks with no notes/attachments/dependencies
    if ((nextTotals?.focusNoNotesDepsAtt || 0) >= 5) earned.add("Focus Master");
    // "Unblocker": complete 10 previously blocked tasks
    if ((nextTotals?.unblockedCompleted || 0) >= 10) earned.add("Unblocker");
    return Array.from(earned);
  }, []);

  // PUBLIC_INTERFACE
  const recordTaskCreatedWithTimeBlock = useCallback(() => {
    setState((prev) => {
      const totals = { ...(prev.totals || {}) };
      totals.createdTimeBlocked = (totals.createdTimeBlocked || 0) + 1;
      const badges = evaluateBadges(totals, prev.badges);
      return { ...prev, totals, badges: ensureUnique(badges) };
    });
  }, [evaluateBadges]);

  // PUBLIC_INTERFACE
  const recordTaskAssignedOrShared = useCallback(() => {
    setState((prev) => {
      const totals = { ...(prev.totals || {}) };
      totals.sharedAssigned = (totals.sharedAssigned || 0) + 1;
      const badges = evaluateBadges(totals, prev.badges);
      return { ...prev, totals, badges: ensureUnique(badges) };
    });
  }, [evaluateBadges]);

  // PUBLIC_INTERFACE
  const recordFocusCompletion = useCallback(() => {
    setState((prev) => {
      const totals = { ...(prev.totals || {}) };
      totals.focusNoNotesDepsAtt = (totals.focusNoNotesDepsAtt || 0) + 1;
      const badges = evaluateBadges(totals, prev.badges);
      return { ...prev, totals, badges: ensureUnique(badges) };
    });
  }, [evaluateBadges]);

  // PUBLIC_INTERFACE
  const recordUnblockedCompletion = useCallback(() => {
    setState((prev) => {
      const totals = { ...(prev.totals || {}) };
      totals.unblockedCompleted = (totals.unblockedCompleted || 0) + 1;
      const badges = evaluateBadges(totals, prev.badges);
      return { ...prev, totals, badges: ensureUnique(badges) };
    });
  }, [evaluateBadges]);

  // PUBLIC_INTERFACE
  const recordCompletion = useCallback((task, {
    priorityBonus = true,
    streakBonus = true,
    dueBonus = true,
    unblockedBonus = true,
    timeBlockBonus = true,
    localAction = true,
  } = {}) => {
    // Only award if localAction or config allows remote
    if (!localAction && state.config.awardOnLocalActionsOnly) {
      return { delta: 0, reasons: [], leveledUp: false, newBadges: [] };
    }
    const now = new Date();
    const dateKey = toKey(now);
    const weekKey = toWeekKey(now);

    let delta = 0;
    const reasons = [];

    // Baseline
    delta += 10;
    reasons.push("Task completed +10");

    // Priority bonus
    if (priorityBonus) {
      const pri = task.priority || "medium";
      if (pri === "high") { delta += 5; reasons.push("High priority +5"); }
      else if (pri === "medium") { delta += 3; reasons.push("Medium priority +3"); }
    }

    // Due/on-time bonus
    if (dueBonus && task.dueDate && typeof task.completedAt === "string") {
      try {
        const due = new Date(task.dueDate);
        const comp = new Date(task.completedAt);
        if (comp <= due) {
          delta += 5;
          reasons.push("On-time completion +5");
        }
      } catch {}
    }

    // Time-block adherence
    if (timeBlockBonus && task.startTime && task.endTime && typeof task.completedAt === "string") {
      try {
        const s = new Date(task.startTime).getTime();
        const e = new Date(task.endTime).getTime();
        const c = new Date(task.completedAt).getTime();
        if (!isNaN(s) && !isNaN(e) && c >= s && c <= e) {
          delta += 5;
          reasons.push("Time-block adherence +5");
        }
      } catch {}
    }

    // Unblocked dependency bonus (caller decides if task was previously blocked)
    if (unblockedBonus && task._wasBlockedBeforeComplete) {
      delta += 5;
      reasons.push("Unblocked task +5");
    }

    // Streak bonus: +5 when completing at least 1 task for the Nth consecutive day.
    // Here we check if today continues a streak in totals.completionsByDay
    if (streakBonus) {
      // If there was at least one completion yesterday, and this is the first today, award +5
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yKey = toKey(yesterday);
      const todayCount = (state.totals?.completionsByDay?.[dateKey] || 0);
      const yCount = (state.totals?.completionsByDay?.[yKey] || 0);
      if (yCount > 0 && todayCount === 0) {
        delta += 5;
        reasons.push("Streak continued +5");
      }
    }

    let leveledUpFlag = false;
    let newBadgesEarned = [];
    setState((prev) => {
      const totals = { ...(prev.totals || {}) };
      totals.completedTasks = (totals.completedTasks || 0) + 1;

      const byDay = { ...(totals.completionsByDay || {}) };
      byDay[dateKey] = (byDay[dateKey] || 0) + 1;
      totals.completionsByDay = byDay;

      const byWeek = { ...(totals.completionsByWeek || {}) };
      byWeek[weekKey] = (byWeek[weekKey] || 0) + 1;
      totals.completionsByWeek = byWeek;

      if (task.dueDate && typeof task.completedAt === "string") {
        try {
          const due = new Date(task.dueDate);
          const comp = new Date(task.completedAt);
          if (comp <= due) {
            totals.completedBeforeDue = (totals.completedBeforeDue || 0) + 1;
          }
        } catch {}
      }

      // Focus Master meta (no notes/attachments/dependencies)
      const hasNotes = Array.isArray(task.notes) && task.notes.length > 0;
      const hasAtts = Array.isArray(task.attachments) && task.attachments.length > 0;
      const hasDeps = Array.isArray(task.dependencies) && task.dependencies.length > 0;
      if (!hasNotes && !hasAtts && !hasDeps) {
        totals.focusNoNotesDepsAtt = (totals.focusNoNotesDepsAtt || 0) + 1;
      }

      const badgesEvaluated = evaluateBadges(totals, prev.badges);
      // compute new badges earned now
      newBadgesEarned = badgesEvaluated.filter((b) => !(prev.badges || []).includes(b));

      const levelComp = applyLeveling(prev, delta);
      leveledUpFlag = levelComp.leveledUp;

      const updated = {
        ...prev,
        ...levelComp,
        lastEarnedAt: new Date().toISOString(),
        totals,
        badges: ensureUnique(badgesEvaluated),
        history: [
          { id: `h_${Math.random().toString(36).slice(2)}_${Date.now()}`, taskId: task.id, delta, reason: reasons.join(" + "), at: new Date().toISOString() },
          ...(prev.history || []),
        ].slice(0, 500),
      };
      return updated;
    });

    return { delta, reasons, leveledUp: leveledUpFlag, newBadges: newBadgesEarned };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config.awardOnLocalActionsOnly, state.totals, evaluateBadges]);

  // PUBLIC_INTERFACE
  const rollbackCompletion = useCallback((taskId, occurrenceIdOrIso) => {
    // For simplicity, subtract the history entry matching taskId and at ~ occurrence timestamp if found.
    // Otherwise, no-op. We don't strictly need exact rollback of all reasons; we subtract total delta recorded for that entry.
    setState((prev) => {
      const hist = Array.isArray(prev.history) ? prev.history : [];
      const idx = hist.findIndex(h => h.taskId === taskId && (h.id === occurrenceIdOrIso || h.at === occurrenceIdOrIso));
      if (idx === -1) return prev;
      const entry = hist[idx];
      const delta = entry.delta || 0;
      const points = Math.max(0, (prev.points || 0) - delta);
      const xp = points;
      // We will not down-level automatically to keep it simple; levels only move upwards in this MVP.
      const updated = {
        ...prev,
        points,
        xp,
        history: [...hist.slice(0, idx), ...hist.slice(idx + 1)],
      };
      return updated;
    });
  }, []);

  // PUBLIC_INTERFACE
  const resetGamification = useCallback(() => {
    const fresh = defaultState();
    setState(fresh);
    save(fresh);
  }, []);

  return {
    state,
    awardPoints,
    recordCompletion,
    rollbackCompletion,
    recordTaskCreatedWithTimeBlock,
    recordTaskAssignedOrShared,
    recordFocusCompletion,
    recordUnblockedCompletion,
    getBadgeList,
    getLevelInfo,
    resetGamification,
  };
}
