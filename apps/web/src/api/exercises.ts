import type { Exercise } from '../types/exercise';

/** Thrown when an exercise id does not resolve to a known exercise (HTTP 404). */
export class ExerciseNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Exercise "${id}" was not found`);
    this.name = 'ExerciseNotFoundError';
  }
}

/** Thrown for transport/server errors while loading an exercise. */
export class ExerciseLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExerciseLoadError';
  }
}

/**
 * Fetch a single exercise via `GET /api/exercises/:id`.
 *
 * - 404 -> {@link ExerciseNotFoundError} (caller renders the inline error card).
 * - other non-2xx / network failure -> {@link ExerciseLoadError}.
 */
export async function fetchExercise(id: string, signal?: AbortSignal): Promise<Exercise> {
  const encoded = encodeURIComponent(id);
  let response: Response;
  try {
    response = await fetch(`/api/exercises/${encoded}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new ExerciseLoadError(
      err instanceof Error ? err.message : 'Network error while loading exercise',
    );
  }

  if (response.status === 404) {
    throw new ExerciseNotFoundError(id);
  }
  if (!response.ok) {
    throw new ExerciseLoadError(`Failed to load exercise (HTTP ${response.status})`);
  }

  const data = (await response.json()) as Exercise;
  if (!data || typeof data.id !== 'string') {
    throw new ExerciseLoadError('Malformed exercise payload');
  }
  return data;
}
