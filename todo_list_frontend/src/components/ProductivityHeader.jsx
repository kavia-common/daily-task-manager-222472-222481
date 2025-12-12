import React from "react";

/**
 * Header widget showing progress, streak, and productivity score.
 * Props:
 * - todayTotals: { total, completed, rate }
 * - todayScore: number
 * - currentStreak: number
 * - bestStreak: number
 */
// PUBLIC_INTERFACE
export default function ProductivityHeader({ todayTotals, todayScore, currentStreak, bestStreak }) {
  /** Displays today's completion progress, productivity score, and streak badges. */
  const pct = Math.round((todayTotals?.rate || 0) * 100);
  const completed = todayTotals?.completed || 0;
  const total = todayTotals?.total || 0;

  return (
    <div className="prod-header" role="region" aria-label="Productivity header">
      <div className="prod-header-row">
        <div className="prod-progress">
          <div className="prod-progress-label">Today’s Progress</div>
          <div className="prod-progress-bar" aria-label={`Progress ${pct}%`}>
            <div className="prod-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="prod-progress-meta">{completed} / {total} ({pct}%)</div>
        </div>
        <div className="prod-score">
          <div className="prod-score-label">Productivity Score</div>
          <div className="prod-score-value" aria-label={`Today's score ${todayScore}`}>{todayScore}</div>
        </div>
      </div>
      <div className="prod-header-row">
        <div className="prod-streak">
          <span className="streak-chip" title="Current streak">🔥 Current Streak: {currentStreak}d</span>
          <span className="streak-chip best" title="Best streak">🏆 Best: {bestStreak}d</span>
        </div>
      </div>
    </div>
  );
}
