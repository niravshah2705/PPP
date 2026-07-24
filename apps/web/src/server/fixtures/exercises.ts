import type { Exercise } from '../../types/exercise';
import exerciseSeed from './exercises.json';

/**
 * Seeded exercise library, loaded on boot from the `exercises.json` fixture.
 *
 * This is the single read-only catalogue that:
 * - backs `GET /api/exercises` and `GET /api/exercises/:id` (see
 *   `../exercisesHandler.ts`), so every record carries a complete tracking
 *   config, defaults (`defaultSets`/`defaultReps`/`defaultHoldSeconds`) and
 *   `targetJoints[]` for the doctor picker and the motion tracker;
 * - the template/plan read handlers join against when expanding items into
 *   preview items (name + demo media). Plan template/plan fixtures may only
 *   reference ids that appear here — enforced by the integrity check in
 *   `templateIntegrity.ts` and its test.
 *
 * The JSON is validated by `test/server/exercisesHandler.test.ts` (shape +
 * completeness), so the structural cast below is safe.
 */
export const EXERCISE_CATALOG: readonly Exercise[] = exerciseSeed as unknown as readonly Exercise[];

/** Index the catalogue by id for O(1) joins during template expansion. */
export function indexExercisesById(
  exercises: readonly Exercise[] = EXERCISE_CATALOG,
): Map<string, Exercise> {
  const index = new Map<string, Exercise>();
  for (const exercise of exercises) index.set(exercise.id, exercise);
  return index;
}
