import { formatDate, formatPercent, formatScore, summariseSession } from '../lib/sessionSummary';
import type { Session } from '../types/session';
import './SessionList.css';

export interface SessionListProps {
  sessions: Session[];
  /** Currently selected session id (drives the highlighted row). */
  selectedId?: string;
  onSelect: (sessionId: string) => void;
}

/**
 * Newest-first list of a plan's sessions. Each row shows the date, persisted
 * completion %, persisted average form, and the done/skipped exercise counts.
 * Selecting a row opens its drill-down in the detail panel.
 *
 * `sessions` is expected pre-sorted (the hook sorts newest-first); the row
 * `aria-current`/highlight tracks the selection.
 */
export function SessionList({ sessions, selectedId, onSelect }: SessionListProps) {
  return (
    <ul className="session-list" data-testid="session-list">
      {sessions.map((session) => {
        const summary = summariseSession(session);
        const selected = session.id === selectedId;
        return (
          <li key={session.id}>
            <button
              type="button"
              className={`session-list__row${selected ? ' session-list__row--selected' : ''}`}
              aria-current={selected ? 'true' : undefined}
              data-testid={`session-row-${session.id}`}
              onClick={() => onSelect(session.id)}
            >
              <span className="session-list__date">{formatDate(summary.date)}</span>
              <span className="session-list__completion" data-testid={`session-completion-${session.id}`}>
                {formatPercent(summary.completionPct)} complete
              </span>
              <span className="session-list__form" data-testid={`session-form-${session.id}`}>
                Avg form {formatScore(summary.avgForm)}
              </span>
              <span className="session-list__counts">
                {summary.doneCount} done · {summary.skippedCount} skipped
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
