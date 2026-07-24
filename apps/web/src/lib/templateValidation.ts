import type { TemplateDraft, TemplateItem } from '../types/template';

/**
 * Numeric bounds for item dosage. These mirror the plan builder's rules exactly
 * so a template and any plan instantiated from it validate identically. This is
 * the single source of truth shared by the client form and the server, which
 * validates the same way before persisting.
 */
export const ITEM_BOUNDS = {
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 50 },
  hold: { min: 0, max: 120 },
  rest: { min: 0, max: 300 },
} as const;

/** Dosage fields that carry numeric bounds. */
export type ItemBoundField = keyof typeof ITEM_BOUNDS;

/** A single validation error keyed to the field it belongs to. */
export interface FieldError {
  /**
   * Path of the offending field so the UI can surface the message on the right
   * control. Examples: `name`, `items`, `items[2].reps`, `items[0].exerciseId`.
   */
  field: string;
  message: string;
}

const BOUND_FIELDS: ItemBoundField[] = ['sets', 'reps', 'hold', 'rest'];

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Validate a single dosage number against its bounds, pushing a field-keyed
 * error when out of range or non-integer.
 */
function validateBound(
  errors: FieldError[],
  fieldPath: string,
  field: ItemBoundField,
  value: number,
): void {
  const { min, max } = ITEM_BOUNDS[field];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    errors.push({ field: fieldPath, message: `${field} is required` });
    return;
  }
  if (!isInteger(value)) {
    errors.push({ field: fieldPath, message: `${field} must be a whole number` });
    return;
  }
  if (value < min || value > max) {
    errors.push({ field: fieldPath, message: `${field} must be between ${min} and ${max}` });
  }
}

/**
 * Validate one template item, prefixing error field paths with `items[index]`.
 * `knownExerciseIds`, when provided, additionally checks the exercise id
 * resolves to a real exercise.
 */
export function validateTemplateItem(
  item: TemplateItem,
  index: number,
  knownExerciseIds?: ReadonlySet<string>,
): FieldError[] {
  const errors: FieldError[] = [];
  const prefix = `items[${index}]`;

  const exerciseId = typeof item.exerciseId === 'string' ? item.exerciseId.trim() : '';
  if (!exerciseId) {
    errors.push({ field: `${prefix}.exerciseId`, message: 'Select an exercise' });
  } else if (knownExerciseIds && !knownExerciseIds.has(exerciseId)) {
    errors.push({ field: `${prefix}.exerciseId`, message: `Unknown exercise "${exerciseId}"` });
  }

  for (const field of BOUND_FIELDS) {
    validateBound(errors, `${prefix}.${field}`, field, item[field]);
  }

  return errors;
}

/**
 * Validate a full template draft. Returns an array of field-keyed errors; an
 * empty array means the draft is valid and safe to persist. Nothing is mutated.
 *
 * @param draft The template draft to validate.
 * @param knownExerciseIds Optional set of valid exercise ids; when supplied,
 *   each item's `exerciseId` must be a member.
 */
export function validateTemplateDraft(
  draft: TemplateDraft,
  knownExerciseIds?: ReadonlySet<string>,
): FieldError[] {
  const errors: FieldError[] = [];

  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  if (!name) {
    errors.push({ field: 'name', message: 'Template name is required' });
  } else if (name.length > 120) {
    errors.push({ field: 'name', message: 'Template name must be 120 characters or fewer' });
  }

  if (draft.description != null && draft.description.length > 500) {
    errors.push({ field: 'description', message: 'Description must be 500 characters or fewer' });
  }

  const tags = Array.isArray(draft.categoryTags) ? draft.categoryTags : [];
  tags.forEach((tag, i) => {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      errors.push({ field: `categoryTags[${i}]`, message: 'Tag cannot be empty' });
    }
  });

  const items = Array.isArray(draft.items) ? draft.items : [];
  if (items.length === 0) {
    errors.push({ field: 'items', message: 'Add at least one exercise item' });
  }
  items.forEach((item, i) => {
    errors.push(...validateTemplateItem(item, i, knownExerciseIds));
  });

  return errors;
}

/** True when the draft passes all validation rules. */
export function isTemplateDraftValid(
  draft: TemplateDraft,
  knownExerciseIds?: ReadonlySet<string>,
): boolean {
  return validateTemplateDraft(draft, knownExerciseIds).length === 0;
}

/**
 * Index field errors by field path for O(1) lookup in form controls, e.g.
 * `errorsByField(errors)['items[1].reps']`.
 */
export function errorsByField(errors: FieldError[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const err of errors) {
    // Keep the first message per field so the UI shows a stable primary error.
    if (!(err.field in map)) map[err.field] = err.message;
  }
  return map;
}
