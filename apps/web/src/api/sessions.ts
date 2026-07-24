import type { PatientProgress, Session } from '../types/session';
import type { TrackedExerciseResult } from '../lib/sessionSequencer';

/** Fields required to open a new in-progress session for a plan. */
export interface CreateSessionInput {
  /** Plan the session belongs to (from the loaded plan). */
  planId: string;
  /** Patient the session is for (from the loaded plan). */
  patientName?: string;
}

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

function assertSession(data: unknown): Session {
  const s = data as Session;
  if (!s || typeof s.id !== 'string' || typeof s.planId !== 'string') {
    throw new SessionSaveError('Malformed session payload');
  }
  return s;
}

/**
 * Open a new in-progress session via `POST /api/sessions` — the "Start" action
 * of the patient player.
 *
 * The session is tied to the loaded plan's `planId` and `patientName` and is
 * created with `status: 'in_progress'`, so a tab closed mid-session leaves the
 * record in progress and reopening the plan can offer to resume it. The created
 * {@link Session} (with its server `id`) is returned so the player can PATCH
 * results into it and later finalise it. Non-2xx / network failure ->
 * {@link SessionSaveError}.
 */
export async function createSession(
  input: CreateSessionInput,
  signal?: AbortSignal,
): Promise<Session> {
  let response: Response;
  try {
    response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...input, status: 'in_progress' }),
      signal,
    });
  } catch (err) {
    throw new SessionSaveError(
      err instanceof Error ? err.message : 'Network error while starting session',
    );
  }

  if (!response.ok) {
    throw new SessionSaveError(`Failed to start session (HTTP ${response.status})`);
  }

  return assertSession(await response.json());
}

/**
 * Finalise a session via `PATCH /api/sessions/:id`, marking it `completed` with
 * a `completedAt` timestamp — the completion screen's terminal write.
 *
 * Kept separate from {@link patchSessionResults} so the finalise transition
 * carries only the lifecycle fields (never per-exercise result fields). The
 * `completedAt` timestamp is injectable for deterministic tests. Non-2xx /
 * network failure -> {@link SessionSaveError}.
 */
export async function finalizeSession(
  sessionId: string,
  completedAt: string = new Date().toISOString(),
  signal?: AbortSignal,
): Promise<void> {
  const encoded = encodeURIComponent(sessionId);
  let response: Response;
  try {
    response = await fetch(`/api/sessions/${encoded}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ status: 'completed', completedAt }),
      signal,
    });
  } catch (err) {
    throw new SessionSaveError(
      err instanceof Error ? err.message : 'Network error while finalising session',
    );
  }

  if (!response.ok) {
    throw new SessionSaveError(`Failed to finalise session (HTTP ${response.status})`);
  }
}
