import type { PatientProgress, Session } from '../types/session';
import type { TrackedExerciseResult } from '../lib/sessionSequencer';

/** Thrown for transport/server errors while loading session-review data. */
export class SessionLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionLoadError';
  }
}

/** Thrown for transport/server errors while persisting tracked session results. */
export class SessionSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionSaveError';
  }
}

/**
 * Fetch a plan's sessions via `GET /api/sessions?planId=`.
 *
 * Returns the raw list from the server (may be empty — the caller renders the
 * empty-state guidance). Non-2xx / network failure / malformed payload ->
 * {@link SessionLoadError}.
 */
export async function fetchSessions(planId: string, signal?: AbortSignal): Promise<Session[]> {
  const encoded = encodeURIComponent(planId);
  let response: Response;
  try {
    response = await fetch(`/api/sessions?planId=${encoded}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new SessionLoadError(
      err instanceof Error ? err.message : 'Network error while loading sessions',
    );
  }

  if (!response.ok) {
    throw new SessionLoadError(`Failed to load sessions (HTTP ${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new SessionLoadError('Malformed sessions payload');
  }
  return data as Session[];
}

/**
 * Fetch a plan's chart-ready progress series via `GET /api/progress?planId=`.
 *
 * Non-2xx / network failure / malformed payload -> {@link SessionLoadError}. A
 * missing/empty `series` is tolerated and normalised to an empty array so the
 * trend chart can render its own empty state.
 */
export async function fetchProgress(
  planId: string,
  signal?: AbortSignal,
): Promise<PatientProgress> {
  const encoded = encodeURIComponent(planId);
  let response: Response;
  try {
    response = await fetch(`/api/progress?planId=${encoded}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new SessionLoadError(
      err instanceof Error ? err.message : 'Network error while loading progress',
    );
  }

  if (!response.ok) {
    throw new SessionLoadError(`Failed to load progress (HTTP ${response.status})`);
  }

  const data = (await response.json()) as Partial<PatientProgress> | null;
  if (!data || typeof data.planId !== 'string') {
    throw new SessionLoadError('Malformed progress payload');
  }
  return {
    planId: data.planId,
    series: Array.isArray(data.series) ? data.series : [],
  };
}

/**
 * Persist one exercise's tracked results via `PATCH /api/sessions/:id`.
 *
 * The body carries exactly the session-schema fields the backend records per
 * exercise — `exerciseId`, `completedReps`, `avgFormScore`, and
 * `maxRangeOfMotionDeg` — so the auto-advance and manual paths write identical
 * data and the review/summary screens stay consistent. Non-2xx / network
 * failure -> {@link SessionSaveError}.
 */
export async function patchSessionResults(
  sessionId: string,
  result: TrackedExerciseResult,
  signal?: AbortSignal,
): Promise<void> {
  const encoded = encodeURIComponent(sessionId);
  let response: Response;
  try {
    response = await fetch(`/api/sessions/${encoded}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(result),
      signal,
    });
  } catch (err) {
    throw new SessionSaveError(
      err instanceof Error ? err.message : 'Network error while saving session results',
    );
  }

  if (!response.ok) {
    throw new SessionSaveError(`Failed to save session results (HTTP ${response.status})`);
  }
}
