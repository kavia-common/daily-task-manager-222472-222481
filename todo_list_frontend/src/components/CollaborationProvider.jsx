import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * CollaborationProvider
 * Provides real-time collaboration using WebSocket if REACT_APP_WS_URL is set, or BroadcastChannel fallback.
 * Exposes:
 *  - broadcast(event, payload)
 *  - on(event, handler) => unsubscribe
 *  - presence: { onlineCount, users, selfId }
 *  - connected: boolean
 *  - transport: 'websocket' | 'broadcast' | 'none'
 */

// Internal event names
const EVENTS = {
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_DELETED: 'task:deleted',
  PRESENCE_CURSOR: 'presence:cursor',
  PRESENCE_ONLINE: 'presence:online',
};

const CollaborationContext = createContext(null);

function getSelfId() {
  // PUBLIC_INTERFACE
  // Derive current user identifier from env or fallback to 'me'
  /** Returns the current user identifier/email to be used for permission heuristics and presence. */
  const envId = process.env.REACT_APP_USER_EMAIL && process.env.REACT_APP_USER_EMAIL.trim();
  return envId || 'me';
}

function nowIso() {
  return new Date().toISOString();
}

// Simple throttle util to avoid spamming events
function throttle(fn, interval = 250) {
  let last = 0;
  let timeout = null;
  let lastArgs = null;
  return (...args) => {
    const ts = Date.now();
    lastArgs = args;
    const run = () => {
      last = Date.now();
      timeout = null;
      fn(...lastArgs);
    };
    if (ts - last >= interval) {
      run();
    } else if (!timeout) {
      timeout = setTimeout(run, interval - (ts - last));
    }
  };
}

export const CollaborationProvider = ({ children }) => {
  const wsUrl = process.env.REACT_APP_WS_URL;
  const selfId = useMemo(() => getSelfId(), []);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState('none');
  const [presence, setPresence] = useState({ onlineCount: 1, users: { [selfId]: { lastSeen: Date.now() } }, selfId });

  const channelRef = useRef(null);
  const wsRef = useRef(null);
  const handlersRef = useRef({});
  const heartbeatTimerRef = useRef(null);

  // Register handler
  const on = useCallback((event, handler) => {
    handlersRef.current[event] = handlersRef.current[event] || new Set();
    handlersRef.current[event].add(handler);
    return () => {
      handlersRef.current[event].delete(handler);
    };
  }, []);

  const emitLocal = useCallback((event, payload) => {
    const setForEvent = handlersRef.current[event];
    if (setForEvent) {
      setForEvent.forEach((h) => {
        try {
          h(payload);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Collab handler error', e);
        }
      });
    }
  }, []);

  const sendMessage = useCallback(
    (msg) => {
      const wrapped = { ...msg, _meta: { sender: selfId, ts: Date.now() } };
      if (transport === 'websocket' && wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify(wrapped));
      } else if (transport === 'broadcast' && channelRef.current) {
        channelRef.current.postMessage(wrapped);
      }
    },
    [transport, selfId]
  );

  const broadcast = useMemo(
    () =>
      throttle((event, payload) => {
        sendMessage({ type: event, payload });
      }, 150),
    [sendMessage]
  );

  // Presence heartbeat
  useEffect(() => {
    const sendHeartbeat = () => {
      sendMessage({ type: EVENTS.PRESENCE_ONLINE, payload: { userId: selfId, at: Date.now() } });
    };
    heartbeatTimerRef.current = setInterval(sendHeartbeat, 4000);
    sendHeartbeat();
    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
    };
  }, [sendMessage, selfId]);

  // Setup transport
  useEffect(() => {
    let ws;
    if (wsUrl) {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setTransport('websocket');
        ws.addEventListener('open', () => {
          setConnected(true);
        });
        ws.addEventListener('close', () => {
          setConnected(false);
        });
        ws.addEventListener('message', (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type) {
              emitLocal(data.type, data);
            }
          } catch (err) {
            // ignore
          }
        });
      } catch (e) {
        // fallback to broadcast
        setTransport('broadcast');
      }
    }

    if (!wsUrl) {
      // BroadcastChannel fallback
      try {
        const bc = new BroadcastChannel('todo_collab_v1');
        channelRef.current = bc;
        setTransport('broadcast');
        setConnected(true);
        bc.onmessage = (e) => {
          const data = e.data;
          if (data && data.type) {
            emitLocal(data.type, data);
          }
        };
      } catch (e) {
        // no transport
        setTransport('none');
        setConnected(false);
      }
    }

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          // ignore
        }
      }
      if (channelRef.current) {
        try {
          channelRef.current.close();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [wsUrl, emitLocal]);

  // Handle presence aggregation
  useEffect(() => {
    const unsub = on(EVENTS.PRESENCE_ONLINE, (msg) => {
      const { payload, _meta } = msg || {};
      const id = (payload && payload.userId) || (_meta && _meta.sender) || 'unknown';
      setPresence((prev) => {
        const users = { ...prev.users, [id]: { lastSeen: Date.now() } };
        // prune stale > 15s
        const pruned = {};
        const now = Date.now();
        Object.entries(users).forEach(([k, v]) => {
          if (now - (v.lastSeen || 0) < 15000) pruned[k] = v;
        });
        return { onlineCount: Object.keys(pruned).length, users: pruned, selfId };
      });
    });
    return () => unsub && unsub();
  }, [on, selfId]);

  const value = useMemo(
    () => ({
      on,
      broadcast,
      presence,
      connected,
      transport,
      EVENTS,
      selfId,
      nowIso,
    }),
    [on, broadcast, presence, connected, transport, selfId]
  );

  return <CollaborationContext.Provider value={value}>{children}</CollaborationContext.Provider>;
};

// PUBLIC_INTERFACE
export function useCollaboration() {
  /** Hook to access collaboration context: { on, broadcast, presence, connected, transport, EVENTS, selfId, nowIso } */
  const ctx = useContext(CollaborationContext);
  if (!ctx) {
    throw new Error('useCollaboration must be used within CollaborationProvider');
  }
  return ctx;
}
