import type { PlanInput, StoredPlanItem } from '../types/storedPlan';
import { ITEM_BOUNDS, type FieldError } from './templateValidation';

/**
 * Server-side validation for the plan persistence endpoints (`POST /api/plans`,
 * `PUT /api/plans/:id`).
 *
 * The numeric bounds reuse {@link ITEM_BOUNDS} — the single source of truth also
 * used by templates and the plan builder — so a plan validates identically
 * wherever it is checked (`sets` 1–10, `reps` 1–50, `holdSeconds` 0–120,
 * `restSeconds` 0–300). Validation is pure: it mutates nothing and returns an
 * array of field-keyed errors, so a caller can reject a payload and persist
 * nothing. An empty array means the payload is valid.
 *
 * Errors are keyed by field path (e.g. `patientName`, `items`,
 * `items[2].reps`, `items[0].exerciseId`) so the response can list a message per
 * offending field and a client can surface each on the right control.
 */

/** Maps a stored-item dosage field onto its {@link ITEM_BOUNDS} entry. */
const BOUND_FIELDS: ReadonlyArray<{
  key: keyof Pick<StoredPlanItem, 'sets' | 'reps' | 'holdSeconds' | 'restSeconds'>;
  bound: keyof typeof ITEM_BOUNDS;
}> = [
  { key: 'sets', bound: 'sets' },
  { key: 'reps', bound: 'reps' },
  { key: 'holdSeconds', bound: 'hold' },
  { key: 'restSeconds', bound: 'rest' },
];

/**
 * Validate one numeric dosage field against its bounds, pushing a field-keyed
 * error when missing, non-integer, or out of range.
 */
function validateBound(
  errors: FieldError[],
  fieldPath: string,
  label: string,
  bound: keyof typeof ITEM_BOUNDS,
  value: number,
): void {
  const { min, max } = ITEM_BOUNDS[bound];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    errors.push({ field: fieldPath, message: `${label} is required` });
    return;
  }
  if (!Number.isInteger(value)) {
    errors.push({ field: fieldPath, message: `${label} must be a whole number` });
    return;
  }
  if (value < min || value > max) {
    errors.push({ field: fieldPath, message: `${label} must be between ${min} and ${max}` });
  }
}

/**
 * Validate a single stored-plan item, prefixing error field paths with
 * `items[index]`. When `knownExerciseIds` is supplied, the item's `exerciseId`
 * must resolve to a member of that set.
 */
export function validateStoredPlanItem(
  item: StoredPlanItem,
  index: number,
  knownExerciseIds?: ReadonlySet<string>,
): FieldError[] {
  const errors: FieldError[] = [];
  const prefix = `items[${index}]`;

  const exerciseId = typeof item?.exerciseId === 'string' ? item.exerciseId.trim() : '';
  if (!exerciseId) {
    errors.push({ field: `${prefix}.exerciseId`, message: 'Select an exercise' });
  } else if (knownExerciseIds && !knownExerciseIds.has(exerciseId)) {
    errors.push({ field: `${prefix}.exerciseId`, message: `Unknown exercise "${exerciseId}"` });
  }

  for (const { key, bound } of BOUND_FIELDS) {
    validateBound(errors, `${prefix}.${key}`, key, bound, item?.[key]);
  }

  const order = item?.order;
  if (typeof order !== 'number' || Number.isNaN(order)) {
    errors.push({ field: `${prefix}.order`, message: 'order is required' });
  } else if (!Number.isInteger(order) || order < 0) {
    errors.push({ field: `${prefix}.order`, message: 'order must be a non-negative whole number' });
  }

  return errors;
}

/**
 * Validate a full {@link PlanInput}. Returns an array of field-keyed errors; an
 * empty array means the payload is valid and safe to persist. Nothing is
 * mutated.
 *
 * Rules: a non-empty `patientName` is required, at least one item is required
 * (an empty `items` array is rejected), and every item must pass
 * {@link validateStoredPlanItem}.
 *
 * @param input The plan payload to validate.
 * @param knownExerciseIds Optional set of valid exercise ids; when supplied,
 *   each item's `exerciseId` must be a member.
 */
export function validatePlanInput(
  input: PlanInput,
  knownExerciseIds?: ReadonlySet<string>,
): FieldError[] {
  const errors: FieldError[] = [];

  const patientName = typeof input?.patientName === 'string' ? input.patientName.trim() : '';
  if (!patientName) {
    errors.push({ field: 'patientName', message: 'Patient name is required' });
  } else if (patientName.length > 120) {
    errors.push({ field: 'patientName', message: 'Patient name must be 120 characters or fewer' });
  }

  if (input?.notes != null && input.notes.length > 2000) {
    errors.push({ field: 'notes', message: 'Notes must be 2000 characters or fewer' });
  }

  const items = Array.isArray(input?.items) ? input.items : [];
  if (items.length === 0) {
    errors.push({ field: 'items', message: 'Add at least one exercise item' });
  }
  items.forEach((item, i) => {
    errors.push(...validateStoredPlanItem(item, i, knownExerciseIds));
  });

  return errors;
}

/** True when the payload passes all validation rules. */
export function isPlanInputValid(
  input: PlanInput,
  knownExerciseIds?: ReadonlySet<string>,
): boolean {
  return validatePlanInput(input, knownExerciseIds).length === 0;
}
