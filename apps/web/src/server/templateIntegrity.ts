import type { Exercise } from '../types/exercise';
import type { PlanTemplate } from '../types/planTemplate';
import { EXERCISE_CATALOG, indexExercisesById } from './fixtures/exercises';
import { PLAN_TEMPLATES } from './fixtures/planTemplates';

/** A template item whose `exerciseId` does not resolve to a known exercise. */
export interface MissingExerciseReference {
  templateId: string;
  /** Zero-based position of the offending item within the template. */
  index: number;
  exerciseId: string;
}

/**
 * Scan templates for items whose `exerciseId` is not present in the exercise
 * index. Returns every dangling reference (empty array means fully consistent).
 * Pure — nothing is mutated or logged.
 */
export function findMissingExerciseReferences(
  templates: readonly PlanTemplate[] = PLAN_TEMPLATES,
  exercises: readonly Exercise[] = EXERCISE_CATALOG,
): MissingExerciseReference[] {
  const index = indexExercisesById(exercises);
  const missing: MissingExerciseReference[] = [];
  for (const template of templates) {
    template.items.forEach((item, i) => {
      if (!index.has(item.exerciseId)) {
        missing.push({ templateId: template.id, index: i, exerciseId: item.exerciseId });
      }
    });
  }
  return missing;
}

/**
 * Assert every seeded template references only existing exercises. Throws with a
 * descriptive message listing each dangling reference. Intended for the seed
 * integrity test (and as an optional startup guard) so bad fixtures never ship.
 */
export function assertTemplatesReferenceKnownExercises(
  templates: readonly PlanTemplate[] = PLAN_TEMPLATES,
  exercises: readonly Exercise[] = EXERCISE_CATALOG,
): void {
  const missing = findMissingExerciseReferences(templates, exercises);
  if (missing.length > 0) {
    const details = missing
      .map((m) => `${m.templateId}[${m.index}] -> "${m.exerciseId}"`)
      .join(', ');
    throw new Error(`Plan templates reference unknown exercise ids: ${details}`);
  }
}
