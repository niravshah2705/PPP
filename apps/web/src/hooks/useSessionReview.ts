import { useEffect, useState } from 'react';
import { fetchProgress, fetchSessions } from '../api/sessions';
import { sortSessionsNewestFirst } from '../lib/sessionSummary';
import type { PatientProgress, Session } from '../types/session';

export type SessionReviewStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface UseSessionReviewResult {
  status: SessionReviewStatus;
  /** Sessions sorted newest-first (present when status is `ready`). */
  sessions: Session[];
  /** Chart-ready progress series (present when status is `ready`). */
  progress?: PatientProgress;
  error?: string;
}

/**
 * Load a plan's session-review data: the session list (GET /api/sessions) and
 * the patient progress series (GET /api/progress), in parallel.
 *
 * Status is discriminated so the page can branch cleanly:
 * - `empty`  — the request succeeded but the plan has no sessions yet.
 * - `ready`  — sessions exist; `sessions` are pre-sorted newest-first.
 * - `error`  — a load failed (progress failures degrade to an empty series
 *   rather than blocking the whole dashboard).
 */
export function useSessionReview(planId: string | undefined): UseSessionReviewResult {
  const [result, setResult] = useState<UseSessionReviewResult>({
    status: 'loading',
    sessions: [],
  });

  useEffect(() => {
    if (!planId) {
      setResult({ status: 'empty', sessions: [] });
      return;
    }

    const controller = new AbortController();
    setResult({ status: 'loading', sessions: [] });

    fetchSessions(planId, controller.signal)
      .then(async (sessions) => {
        if (controller.signal.aborted) return;
        // Progress is supplementary: a failure there should not hide sessions.
        let progress: PatientProgress;
        try {
          progress = await fetchProgress(planId, controller.signal);
        } catch {
          progress = { planId, series: [] };
        }
        if (controller.signal.aborted) return;

        if (sessions.length === 0) {
          setResult({ status: 'empty', sessions: [], progress });
          return;
        }
        setResult({
          status: 'ready',
          sessions: sortSessionsNewestFirst(sessions),
          progress,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          status: 'error',
          sessions: [],
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });

    return () => controller.abort();
  }, [planId]);

  return result;
}
