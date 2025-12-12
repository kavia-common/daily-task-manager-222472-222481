import React, { useEffect, useState } from "react";
import { useCollaboration } from "./CollaborationProvider";

/**
 * Header widget showing progress, streak, productivity score, and presence indicator.
 * Props:
 * - todayTotals: { total, completed, rate }
 * - todayScore: number
 * - currentStreak: number
 * - bestStreak: number
 */
export default function ProductivityHeader({ todayTotals, todayScore, currentStreak, bestStreak }) {
  const { presence, connected, transport } = useCollaboration();
  const pct = Math.round((todayTotals?.rate || 0) * 100);
  const completed = todayTotals?.completed || 0;
  const total = todayTotals?.total || 0;

  const [currentUser, setCurrentUser] = useState(() => (localStorage.getItem('demo_user_email') || process.env.REACT_APP_USER_EMAIL || 'me'));
  useEffect(() => {
    const handler = (e) => {
      const v = e.detail?.user || 'me';
      setCurrentUser(v);
    };
    window.addEventListener('demo:userChanged', handler);
    return () => window.removeEventListener('demo:userChanged', handler);
  }, []);

  return (
    <div className="prod-header" role="region" aria-label="Productivity header">
      <div className="prod-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Today’s Progress</div>
          {connected && <span className="chip" aria-label="Live collaboration enabled" title={`Transport: ${transport}`}>Live</span>}
          <div className="presence" aria-label={`Online users: ${presence.onlineCount}`} title={`Online: ${presence.onlineCount}`}>
            <span className="presence-dot" aria-hidden="true"></span>
            <span className="presence-count">{presence.onlineCount}</span>
          </div>
        </div>
        <div className="prod-score">
          <div className="prod-score-label">Productivity Score</div>
          <div className="prod-score-value" aria-label={`Today's score ${todayScore}`}>{todayScore}</div>
        </div>
      </div>
      <div className="prod-header-row">
        <div style={{ flex: 1 }}>
          <div className="prod-progress-bar" aria-label={`Progress ${pct}%`}>
            <div className="prod-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="prod-progress-meta">{completed} / {total} ({pct}%)</div>
        </div>
        <div className="prod-streak">
          <span className="streak-chip" title="Current streak">🔥 Current Streak: {currentStreak}d</span>
          <span className="streak-chip best" title="Best streak">🏆 Best: {bestStreak}d</span>
        </div>
        <div className="dev-user-switch">
          <label htmlFor="dev-user" className="sr-only">Switch user</label>
          <select
            id="dev-user"
            value={currentUser}
            onChange={(e) => {
              const v = e.target.value;
              setCurrentUser(v);
              localStorage.setItem('demo_user_email', v);
              window.dispatchEvent(new CustomEvent('demo:userChanged', { detail: { user: v } }));
            }}
            aria-label="Change current user (demo)"
            title="Demo: Switch user"
          >
            <option value="me">me</option>
            <option value="alice@example.com">alice@example.com</option>
            <option value="bob@example.com">bob@example.com</option>
            <option value="carol@example.com">carol@example.com</option>
          </select>
        </div>
      </div>
    </div>
  );
}
