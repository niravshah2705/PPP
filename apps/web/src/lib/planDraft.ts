import type { Exercise } from '../types/exercise';
import type { PlanDraft, PlanDraftItem } from '../types/template';
import { ITEM_BOUNDS, validateTemplateItem, type FieldError } from './templateValidation';

/**
 * Compute the next order value for a draft. Explicit item `order` values win;
 * items without one fall back to their array position so a draft instantiated
 * from a template (whose items carry no order) still yields a sensible next
 * value equal to the item count.
 */
export function nextPlanOrder(items: readonly PlanDraftItem[]): number {
  if (items.length === 0) return 0;
  const highest = items.reduce((max, item, index) => {
    const order = typeof item.order === 'number' ? item.order : index;
    return Math.max(max, order);
  }, -1);
  return highest + 1;
}

/**
 * Build a plan-draft item for a library exercise using its defaults. The shared
 * Exercise type carries no dosage, so a new item seeds the same mid-range
 * starting dosage the template add-control uses — valid until the doctor edits
 * it — and takes the supplied next order value.
 */
export function defaultPlanDraftItem(exercise: Exercise, order: number): PlanDraftItem {
  return {
    exerciseId: exercise.id,
    sets: ITEM_BOUNDS.sets.min,
    reps: 10,
    hold: 0,
    rest: 30,
    order,
  };
}

/**
 * Append an exercise from the library to the draft's items, seeding defaults
 * and the next order value. Pure: returns a new array; duplicates are permitted
 * (the picker flags them visibly) so this never dedupes.
 */
export function appendExerciseToItems(
  items: readonly PlanDraftItem[],
  exercise: Exercise,
): PlanDraftItem[] {
  return [...items, defaultPlanDraftItem(exercise, nextPlanOrder(items))];
}

/** True when the exercise id already appears in the draft's items. */
export function isExerciseInDraft(
  items: readonly PlanDraftItem[],
  exerciseId: string,
): boolean {
  return items.some((item) => item.exerciseId === exerciseId);
}

/**
 * Validate a plan draft. Mirrors the template rules: a name is required and
 * every item's dosage must sit within the shared bounds; `knownExerciseIds`,
 * when supplied, additionally checks each item references a real exercise.
 * Returns field-keyed errors (empty means valid).
 */
export function validatePlanDraft(
  draft: PlanDraft,
  knownExerciseIds?: ReadonlySet<string>,
): FieldError[] {
  const errors: FieldError[] = [];

  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  if (!name) {
    errors.push({ field: 'name', message: 'Plan name is required' });
  }

  const items = Array.isArray(draft.items) ? draft.items : [];
  if (items.length === 0) {
    errors.push({ field: 'items', message: 'Add at least one exercise' });
  }
  items.forEach((item, index) => {
    errors.push(...validateTemplateItem(item, index, knownExerciseIds));
  });

  return errors;
}

/**
 * Validate a plan draft for saving. Extends {@link validatePlanDraft} with the
 * hand-off rule that a plan must be assigned to a patient before it can be
 * persisted, so a draft is never saved without a recipient. Returns field-keyed
 * errors (empty means safe to persist); nothing is mutated.
 */
export function validatePlanForSave(
  draft: PlanDraft,
  knownExerciseIds?: ReadonlySet<string>,
): FieldError[] {
  const errors = validatePlanDraft(draft, knownExerciseIds);

  const patient = typeof draft.patientName === 'string' ? draft.patientName.trim() : '';
  if (!patient) {
    errors.push({ field: 'patientName', message: 'Assign a patient' });
  }

  return errors;
}
