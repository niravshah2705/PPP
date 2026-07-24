import {
  formatDate,
  formatPercent,
  formatScore,
  isExerciseComplete,
} from '../lib/sessionSummary';
import type { Session } from '../types/session';
import './SessionDetail.css';

export interface SessionDetailProps {
  session: Session;
}

/**
 * Drill-down panel for one session. Shows the header summary (date, persisted
 * completion %, avg form) and a per-exercise table making completed-vs-target
 * explicit, alongside each exercise's form and ROM. Skipped exercises are
 * clearly flagged; missing form/ROM render as an em dash without breaking the
 * row.
 */
export function SessionDetail({ session }: SessionDetailProps) {
  return (
    <section className="session-detail" data-testid="session-detail">
      <header className="session-detail__header">
        <h2 className="session-detail__title">{formatDate(session.date)}</h2>
        <dl className="session-detail__stats">
          <div>
            <dt>Completion</dt>
            <dd data-testid="detail-completion">{formatPercent(session.completionPct)}</dd>
          </div>
          <div>
            <dt>Avg form</dt>
            <dd data-testid="detail-avg-form">{formatScore(session.avgForm)}</dd>
          </div>
        </dl>
      </header>

      <table className="session-detail__table" data-testid="exercise-table">
        <thead>
          <tr>
            <th scope="col">Exercise</th>
            <th scope="col">Completed / target</th>
            <th scope="col">Form</th>
            <th scope="col">ROM</th>
          </tr>
        </thead>
        <tbody>
          {session.exercises.map((ex) => {
            const complete = isExerciseComplete(ex);
            const stateLabel = ex.skipped ? 'skipped' : complete ? 'complete' : 'partial';
            return (
              <tr
                key={ex.exerciseId}
                className={`session-detail__row session-detail__row--${stateLabel}`}
                data-testid={`exercise-row-${ex.exerciseId}`}
                data-state={stateLabel}
              >
                <th scope="row" className="session-detail__exercise-name">
                  {ex.name}
                </th>
                <td data-testid={`exercise-reps-${ex.exerciseId}`}>
                  {ex.skipped ? (
                    <span className="session-detail__skipped">Skipped</span>
                  ) : (
                    <>
                      <span className="session-detail__reps">
                        {ex.completedReps} / {ex.targetReps}
                      </span>
                      <span
                        className={`session-detail__badge session-detail__badge--${
                          complete ? 'complete' : 'partial'
                        }`}
                      >
                        {complete ? 'Met target' : 'Under target'}
                      </span>
                    </>
                  )}
                </td>
                <td>{formatScore(ex.avgForm)}</td>
                <td>{ex.maxRom == null ? '—' : `${Math.round(ex.maxRom)}°`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
