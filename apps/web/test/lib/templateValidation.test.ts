import { describe, expect, it } from 'vitest';
import {
  ITEM_BOUNDS,
  errorsByField,
  isTemplateDraftValid,
  validateTemplateDraft,
  validateTemplateItem,
} from '../../src/lib/templateValidation';
import type { TemplateDraft, TemplateItem } from '../../src/types/template';

function validItem(overrides: Partial<TemplateItem> = {}): TemplateItem {
  return { exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30, ...overrides };
}

function validDraft(overrides: Partial<TemplateDraft> = {}): TemplateDraft {
  return {
    name: 'Knee rehab',
    description: 'Post-op knee protocol',
    categoryTags: ['knee'],
    items: [validItem()],
    ...overrides,
  };
}

describe('validateTemplateDraft', () => {
  it('accepts a well-formed draft', () => {
    expect(validateTemplateDraft(validDraft())).toEqual([]);
    expect(isTemplateDraftValid(validDraft())).toBe(true);
  });

  it('requires a name', () => {
    const errors = validateTemplateDraft(validDraft({ name: '   ' }));
    expect(errors).toContainEqual({ field: 'name', message: expect.stringContaining('required') });
  });

  it('requires at least one item', () => {
    const errors = validateTemplateDraft(validDraft({ items: [] }));
    expect(errors).toContainEqual({ field: 'items', message: expect.stringContaining('at least one') });
  });

  it('rejects empty category tags on the correct index', () => {
    const errors = validateTemplateDraft(validDraft({ categoryTags: ['ok', ''] }));
    expect(errors).toContainEqual({ field: 'categoryTags[1]', message: expect.any(String) });
  });

  it('enforces the plan-rule bounds and keys errors to the field path', () => {
    const draft = validDraft({
      items: [validItem({ sets: 0, reps: 51, hold: 121, rest: 301 })],
    });
    const map = errorsByField(validateTemplateDraft(draft));
    expect(map['items[0].sets']).toContain('between 1 and 10');
    expect(map['items[0].reps']).toContain('between 1 and 50');
    expect(map['items[0].hold']).toContain('between 0 and 120');
    expect(map['items[0].rest']).toContain('between 0 and 300');
  });

  it('mirrors the documented bounds', () => {
    expect(ITEM_BOUNDS).toEqual({
      sets: { min: 1, max: 10 },
      reps: { min: 1, max: 50 },
      hold: { min: 0, max: 120 },
      rest: { min: 0, max: 300 },
    });
  });

  it('accepts the exact boundary values', () => {
    const draft = validDraft({
      items: [validItem({ sets: 1, reps: 1, hold: 0, rest: 0 }), validItem({ sets: 10, reps: 50, hold: 120, rest: 300 })],
    });
    expect(validateTemplateDraft(draft)).toEqual([]);
  });

  it('rejects non-integer dosage values', () => {
    const errors = validateTemplateDraft(validDraft({ items: [validItem({ reps: 10.5 })] }));
    expect(errors).toContainEqual({ field: 'items[0].reps', message: expect.stringContaining('whole number') });
  });

  it('flags NaN dosage as required', () => {
    const errors = validateTemplateDraft(validDraft({ items: [validItem({ sets: Number.NaN })] }));
    expect(errors).toContainEqual({ field: 'items[0].sets', message: expect.stringContaining('required') });
  });
});

describe('validateTemplateItem exercise ids', () => {
  it('requires a non-empty exercise id', () => {
    const errors = validateTemplateItem(validItem({ exerciseId: '  ' }), 2);
    expect(errors).toContainEqual({ field: 'items[2].exerciseId', message: 'Select an exercise' });
  });

  it('rejects unknown exercise ids when a known set is provided', () => {
    const known = new Set(['knee-1', 'hip-2']);
    const ok = validateTemplateItem(validItem({ exerciseId: 'knee-1' }), 0, known);
    expect(ok.filter((e) => e.field.endsWith('exerciseId'))).toEqual([]);

    const bad = validateTemplateItem(validItem({ exerciseId: 'ghost' }), 0, known);
    expect(bad).toContainEqual({
      field: 'items[0].exerciseId',
      message: expect.stringContaining('Unknown exercise'),
    });
  });
});
