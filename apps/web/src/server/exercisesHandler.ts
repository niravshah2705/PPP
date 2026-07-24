import type { Exercise } from '../types/exercise';
import type { ErrorEnvelope } from '../types/errorEnvelope';
import { errorEnvelope } from '../types/errorEnvelope';
import { EXERCISE_CATALOG } from './fixtures/exercises';

/**
 * Server-side read behavior for the exercise library — the handler core behind
 * `GET /api/exercises` and `GET /api/exercises/:id`.
 *
 * These are pure functions over the seeded catalogue (`exercises.json`, loaded
 * on boot). The catalogue is injectable so the HTTP layer and tests can supply
 * their own data. The HTTP layer only needs to translate the returned
 * `{ status, body }` into a response.
 */

/** A JSON response envelope with a numeric HTTP status. */
export interface JsonResponse<T> {
  status: number;
  body: T;
}

/** Injectable dependencies for the read handlers; defaults to the seed data. */
export interface ExerciseReadDeps {
  exercises?: readonly Exercise[];
}

/** Query parameters accepted by `GET /api/exercises`. */
export interface ListExercisesQuery {
  /**
   * Optional category filter (e.g. `upper`). Matched case-insensitively. An
   * unknown/never-seen category is not an error — it yields an empty list.
   */
  category?: string;
}

/** Error code returned when an exercise id does not resolve. */
export const EXERCISE_NOT_FOUND_CODE = 'exercise_not_found';

function catalog(deps: ExerciseReadDeps): readonly Exercise[] {
  return deps.exercises ?? EXERCISE_CATALOG;
}

/**
 * List the exercise library (`GET /api/exercises`) — always 200.
 *
 * With no `category` the full catalogue is returned. With a `category` the list
 * is filtered case-insensitively; an unknown category yields `[]` (still 200),
 * never an error.
 */
export function handleListExercises(
  query: ListExercisesQuery = {},
  deps: ExerciseReadDeps = {},
): JsonResponse<Exercise[]> {
  const all = catalog(deps);
  const category = query.category?.trim().toLowerCase();
  if (!category) {
    return { status: 200, body: [...all] };
  }
  const matches = all.filter((exercise) => exercise.category?.toLowerCase() === category);
  return { status: 200, body: matches };
}

/**
 * Fetch one exercise (`GET /api/exercises/:id`).
 *
 * - Found -> 200 with the {@link Exercise}.
 * - Unknown id -> 404 with a standard {@link ErrorEnvelope} (`{ error }`).
 */
export function handleGetExercise(
  id: string,
  deps: ExerciseReadDeps = {},
): JsonResponse<Exercise> | JsonResponse<ErrorEnvelope> {
  const exercise = catalog(deps).find((entry) => entry.id === id);
  if (!exercise) {
    return {
      status: 404,
      body: errorEnvelope(EXERCISE_NOT_FOUND_CODE, `Exercise "${id}" was not found`),
    };
  }
  return { status: 200, body: exercise };
}
