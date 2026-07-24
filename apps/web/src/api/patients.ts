import type { ExerciseProgress, PatientProgressReport } from '../types/session';

/** Thrown for transport/server errors while loading a patient progress report. */
export class PatientProgressLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatientProgressLoadError';
  }
}

/**
 * Fetch a patient's chart-ready progress report via
 * `GET /api/patients/:name/progress`.
 *
 * The name is case-insensitive server-side; a patient with no sessions returns
 * an empty `exercises` array with HTTP 200, which is surfaced verbatim (the
 * dashboard renders its own empty state). Non-2xx / network failure / malformed
 * payload -> {@link PatientProgressLoadError}. A missing/empty `exercises`
 * field is normalised to an empty array.
 */
export async function fetchPatientProgress(
  name: string,
  signal?: AbortSignal,
): Promise<PatientProgressReport> {
  const encoded = encodeURIComponent(name);
  let response: Response;
  try {
    response = await fetch(`/api/patients/${encoded}/progress`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new PatientProgressLoadError(
      err instanceof Error ? err.message : 'Network error while loading patient progress',
    );
  }

  if (!response.ok) {
    throw new PatientProgressLoadError(`Failed to load patient progress (HTTP ${response.status})`);
  }

  const data = (await response.json()) as Partial<PatientProgressReport> | null;
  if (!data || typeof data.patientName !== 'string') {
    throw new PatientProgressLoadError('Malformed patient progress payload');
  }
  return {
    patientName: data.patientName,
    exercises: Array.isArray(data.exercises) ? (data.exercises as ExerciseProgress[]) : [],
    adherencePct: typeof data.adherencePct === 'number' ? data.adherencePct : null,
  };
}
