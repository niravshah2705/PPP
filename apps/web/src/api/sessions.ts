import type { PatientProgress, Session } from '../types/session';

/** Thrown for transport/server errors while loading session-review data. */
export class SessionLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionLoadError';
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
