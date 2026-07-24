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

/**
 * Reassign each item's `order` to its array position so the persisted order is
 * deterministic and gap-free (0..n-1) and always matches the on-screen order.
 * Pure: returns a new array of new item objects; the input is untouched.
 */
export function normalizePlanOrder(items: readonly PlanDraftItem[]): PlanDraftItem[] {
  return items.map((item, index) => ({ ...item, order: index }));
}

/**
 * Move the item at `from` to position `to`, returning a new array whose `order`
 * fields are re-normalized to the new positions. The move is stable (it only
 * relocates the one item, preserving the relative order of the rest) and
 * deterministic (order === index afterwards). Out-of-range or no-op indices
 * return the input unchanged so a disabled reorder control is always a no-op.
 * Pure: never mutates the input.
 */
export function movePlanItem(
  items: readonly PlanDraftItem[],
  from: number,
  to: number,
): PlanDraftItem[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items.slice();
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return normalizePlanOrder(next);
}

/** Seconds attributed to a single rep when estimating duration. */
export const SECONDS_PER_REP = 3;

/** Coerce a dosage number to a non-negative, finite value (invalid → 0). */
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Estimate how long a single item takes in seconds. Each set is `reps` reps at
 * {@link SECONDS_PER_REP} plus the per-rep `hold`, and sets are separated by
 * `rest` (between sets only, so no trailing rest after the final set). Invalid
 * or out-of-range numbers count as zero so a partially-edited field never
 * produces a misleading estimate.
 */
export function estimateItemDurationSeconds(item: PlanDraftItem): number {
  const sets = safeCount(item.sets);
  if (sets <= 0) return 0;
  const workPerSet = safeCount(item.reps) * SECONDS_PER_REP + safeCount(item.hold);
  const restBetweenSets = safeCount(item.rest) * Math.max(0, sets - 1);
  return sets * workPerSet + restBetweenSets;
}

/** Sum every item's estimated duration (see {@link estimateItemDurationSeconds}). */
export function estimatePlanDurationSeconds(items: readonly PlanDraftItem[]): number {
  return items.reduce((total, item) => total + estimateItemDurationSeconds(item), 0);
}

/** Format a duration in seconds as `Xm Ys` (or `Ys` under a minute). */
export function formatPlanDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
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
