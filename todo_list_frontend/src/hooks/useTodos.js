/**
 * useTodos hook manages to-do items with localStorage persistence by default.
 * If a backend is configured (via env), it attempts to sync with it but falls back gracefully.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getApiBase } from "../utils/api";

const STORAGE_KEY = "todos_ocean_pro";

// Helpers for local persistence
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

// PUBLIC_INTERFACE
export function useTodos() {
  /** Hook that exposes todos state and CRUD actions. */
  const [todos, setTodos] = useState(() => loadLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const hasBackend = useMemo(() => !!getApiBase(), []);

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
            setTodos(data);
            saveLocal(data); // keep a local cache
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

  // Actions
  const addTodo = useCallback(async (title) => {
    const baseTodo = {
      id: generateLocalId(),
      title: title.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    // optimistic update
    setTodos((prev) => [baseTodo, ...prev]);

    if (hasBackend) {
      try {
        const created = await api.createTodo({ title: baseTodo.title, completed: baseTodo.completed });
        if (created && created.id) {
          // reconcile: replace local id with server id
          setTodos((prev) =>
            prev.map((t) => (t.id === baseTodo.id ? { ...created } : t))
          );
        }
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend]);

  const updateTodo = useCallback(async (id, updates) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    if (hasBackend) {
      try {
        await api.updateTodo(id, updates);
      } catch (e) {
        setError(e);
      }
    }
  }, [hasBackend]);

  const toggleTodo = useCallback(async (id) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
    if (hasBackend) {
      try {
        const t = todos.find((x) => x.id === id);
        await api.updateTodo(id, { completed: !(t?.completed ?? false) });
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
  };
}
