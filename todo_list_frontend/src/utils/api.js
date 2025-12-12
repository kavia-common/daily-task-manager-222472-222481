/**
 * API client that optionally integrates with a backend if environment variables are set.
 * Reads REACT_APP_API_BASE or REACT_APP_BACKEND_URL to determine the base URL.
 * If no backend is configured, all methods resolve to null or return local data as needed.
 */

// PUBLIC_INTERFACE
export function getApiBase() {
  /** Returns the configured API base URL or null if unset. */
  const base =
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    null;
  return base && String(base).trim() ? base : null;
}

/**
 * Helper to handle fetch with JSON.
 */
async function request(path, options = {}) {
  const base = getApiBase();
  if (!base) {
    // No backend configured
    return null;
  }
  const url = `${base.replace(/\/+$/, "")}/${String(path).replace(/^\//, "")}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

// PUBLIC_INTERFACE
export const api = {
  /** Fetch all todos. Returns array of todos or null if backend not configured. */
  async listTodos() {
    try {
      return await request("/todos", { method: "GET" });
    } catch (e) {
      console.warn("API listTodos failed; falling back to local:", e);
      return null;
    }
  },
  /** Create a new todo. Returns created todo or null if backend not configured. */
  async createTodo(todo) {
    try {
      const demoUser = typeof localStorage !== 'undefined' ? localStorage.getItem('demo_user_email') : null;
      const payload = {
        ...todo,
        owner: demoUser || todo.owner || (process.env.REACT_APP_USER_EMAIL || 'me'),
        assignees: Array.isArray(todo.assignees) ? todo.assignees : [],
        sharedWith: Array.isArray(todo.sharedWith) ? todo.sharedWith : [],
        updatedAt: todo.updatedAt || new Date().toISOString(),
      };
      return await request("/todos", { method: "POST", body: JSON.stringify(payload) });
    } catch (e) {
      console.warn("API createTodo failed; falling back to local:", e);
      return null;
    }
  },
  /** Update an existing todo. Returns updated todo or null if backend not configured. */
  async updateTodo(id, updates) {
    try {
      const payload = {
        ...updates,
        updatedAt: updates.updatedAt || new Date().toISOString(),
      };
      return await request(`/todos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } catch (e) {
      console.warn("API updateTodo failed; falling back to local:", e);
      return null;
    }
  },
  /** Delete a todo. Returns true if deleted, or null if backend not configured. */
  async deleteTodo(id) {
    try {
      await request(`/todos/${id}`, { method: "DELETE" });
      return true;
    } catch (e) {
      console.warn("API deleteTodo failed; falling back to local:", e);
      return null;
    }
  },
};
