import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EmptySessions } from '../components/EmptySessions';
import { InlineErrorCard } from '../components/InlineErrorCard';
import { SessionDetail } from '../components/SessionDetail';
import { SessionList } from '../components/SessionList';
import { TrendChart } from '../components/TrendChart';
import { useSessionReview } from '../hooks/useSessionReview';
import './DoctorSessionReviewPage.css';

/**
 * Route `/doctor/sessions/:planId`.
 *
 * The doctor's session-review dashboard: a newest-first list of the patient's
 * sessions, a drill-down detail panel for the selected session, and a trend
 * chart of reps/form/ROM over time from the progress endpoint. When the plan
 * has no sessions yet it shows guidance to share the plan link.
 */
export function DoctorSessionReviewPage() {
  const { planId } = useParams<{ planId: string }>();
  const { status, sessions, progress, error } = useSessionReview(planId);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  // Default the drill-down to the newest session once data arrives.
  useEffect(() => {
    if (status === 'ready' && sessions.length > 0) {
      setSelectedId((current) =>
        current && sessions.some((s) => s.id === current) ? current : sessions[0].id,
      );
    }
  }, [status, sessions]);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId),
    [sessions, selectedId],
  );

  if (!planId) {
    return (
      <InlineErrorCard
        title="No plan selected"
        message="Open this dashboard with a plan id, e.g. /doctor/sessions/plan-123."
      />
    );
  }

  return (
    <main className="session-review" data-testid="session-review">
      <h1 className="session-review__title">Session review</h1>

      {status === 'loading' && (
        <p className="session-review__loading" data-testid="session-review-loading">
          Loading sessions…
        </p>
      )}

      {status === 'error' && (
        <InlineErrorCard
          title="Couldn’t load sessions"
          message={error ?? 'Something went wrong loading this plan. Please try again.'}
        />
      )}

      {status === 'empty' && <EmptySessions planId={planId} />}

      {status === 'ready' && (
        <div className="session-review__body">
          <section className="session-review__list-panel" aria-label="Sessions">
            <SessionList
              sessions={sessions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>

          <section className="session-review__detail-panel" aria-label="Session detail">
            <div className="session-review__trend">
              <h2 className="session-review__subhead">Progress over time</h2>
              <TrendChart series={progress?.series ?? []} />
            </div>
            {selected && <SessionDetail session={selected} />}
          </section>
        </div>
      )}
    </main>
  );
}
