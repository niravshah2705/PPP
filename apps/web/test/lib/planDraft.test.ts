import { describe, expect, it } from 'vitest';
import {
  appendExerciseToItems,
  defaultPlanDraftItem,
  estimateItemDurationSeconds,
  estimatePlanDurationSeconds,
  formatPlanDuration,
  isExerciseInDraft,
  mergePlanDrafts,
  movePlanItem,
  nextPlanOrder,
  normalizePlanOrder,
  validatePlanDraft,
} from '../../src/lib/planDraft';
import type { Exercise } from '../../src/types/exercise';
import type { PlanDraft, PlanDraftItem } from '../../src/types/template';

const exercise: Exercise = { id: 'knee-3', name: 'Wall Squat', category: 'knee' };

const items: PlanDraftItem[] = [
  { exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 },
  { exerciseId: 'knee-2', sets: 2, reps: 15, hold: 0, rest: 45 },
];

describe('nextPlanOrder', () => {
  it('is 0 for an empty draft', () => {
    expect(nextPlanOrder([])).toBe(0);
  });

  it('falls back to array position when items carry no order', () => {
    expect(nextPlanOrder(items)).toBe(2);
  });

  it('uses the highest explicit order value + 1', () => {
    const withOrder: PlanDraftItem[] = [
      { ...items[0], order: 0 },
      { ...items[1], order: 5 },
    ];
    expect(nextPlanOrder(withOrder)).toBe(6);
  });
});

describe('defaultPlanDraftItem', () => {
  it('seeds valid default dosage and the supplied order', () => {
    expect(defaultPlanDraftItem(exercise, 2)).toEqual({
      exerciseId: 'knee-3',
      sets: 1,
      reps: 10,
      hold: 0,
      rest: 30,
      order: 2,
    });
  });
});

describe('appendExerciseToItems', () => {
  it('appends a defaulted item with the next order and does not mutate input', () => {
    const result = appendExerciseToItems(items, exercise);
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({ exerciseId: 'knee-3', order: 2 });
    expect(items).toHaveLength(2);
  });

  it('permits duplicates (never dedupes)', () => {
    const dup: Exercise = { id: 'knee-1', name: 'Knee Raise' };
    const result = appendExerciseToItems(items, dup);
    expect(result.filter((i) => i.exerciseId === 'knee-1')).toHaveLength(2);
    expect(result[2].order).toBe(2);
  });
});

describe('normalizePlanOrder', () => {
  it('assigns each item a gap-free order equal to its position', () => {
    const result = normalizePlanOrder(items);
    expect(result.map((i) => i.order)).toEqual([0, 1]);
    // Pure: input untouched.
    expect(items.every((i) => i.order === undefined)).toBe(true);
  });
});

describe('movePlanItem', () => {
  it('moves an item down and re-normalizes deterministic order values', () => {
    const result = movePlanItem(items, 0, 1);
    expect(result.map((i) => i.exerciseId)).toEqual(['knee-2', 'knee-1']);
    expect(result.map((i) => i.order)).toEqual([0, 1]);
  });

  it('moves an item up and is stable for the untouched items', () => {
    const three: PlanDraftItem[] = [
      { exerciseId: 'a', sets: 1, reps: 1, hold: 0, rest: 0 },
      { exerciseId: 'b', sets: 1, reps: 1, hold: 0, rest: 0 },
      { exerciseId: 'c', sets: 1, reps: 1, hold: 0, rest: 0 },
    ];
    const result = movePlanItem(three, 2, 0);
    expect(result.map((i) => i.exerciseId)).toEqual(['c', 'a', 'b']);
    expect(result.map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it('is a no-op for out-of-range or identical indices and never mutates input', () => {
    expect(movePlanItem(items, 0, 0).map((i) => i.exerciseId)).toEqual(['knee-1', 'knee-2']);
    expect(movePlanItem(items, -1, 0)).toHaveLength(2);
    expect(movePlanItem(items, 0, 5)).toHaveLength(2);
    expect(items).toHaveLength(2);
  });
});

describe('estimate duration', () => {
  it('sums work per set plus rest between sets (no trailing rest)', () => {
    // 3 sets × (10 reps × 3s + 5s hold) = 105; rest 30 × 2 gaps = 60 → 165.
    expect(estimateItemDurationSeconds(items[0])).toBe(165);
    // 2 sets × (15 × 3 + 0) = 90; rest 45 × 1 gap = 45 → 135.
    expect(estimateItemDurationSeconds(items[1])).toBe(135);
    expect(estimatePlanDurationSeconds(items)).toBe(300);
  });

  it('treats invalid/NaN dosage as zero', () => {
    const bad: PlanDraftItem = { exerciseId: 'x', sets: Number.NaN, reps: 10, hold: 0, rest: 30 };
    expect(estimateItemDurationSeconds(bad)).toBe(0);
    expect(estimatePlanDurationSeconds([])).toBe(0);
  });

  it('formats durations as m/s', () => {
    expect(formatPlanDuration(0)).toBe('0s');
    expect(formatPlanDuration(45)).toBe('45s');
    expect(formatPlanDuration(165)).toBe('2m 45s');
    expect(formatPlanDuration(300)).toBe('5m 0s');
  });
});

describe('mergePlanDrafts', () => {
  const base: PlanDraft = {
    sourceTemplateId: 't1',
    templateId: 't1',
    templateName: 'Knee rehab',
    name: 'Knee rehab',
    patientName: 'Ada Lovelace',
    items: [{ exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 }],
  };
  const incoming: PlanDraft = {
    sourceTemplateId: 't2',
    templateId: 't2',
    templateName: 'Shoulder mobility',
    name: 'Shoulder mobility',
    items: [
      { exerciseId: 'sh-1', sets: 2, reps: 12, hold: 0, rest: 20 },
      { exerciseId: 'sh-2', sets: 1, reps: 15, hold: 0, rest: 15 },
    ],
  };

  it("appends the incoming template's items after the current ones", () => {
    const merged = mergePlanDrafts(base, incoming);
    expect(merged.items.map((i) => i.exerciseId)).toEqual(['knee-1', 'sh-1', 'sh-2']);
  });

  it('re-keys the combined items to a gap-free 0..n-1 order', () => {
    const merged = mergePlanDrafts(base, incoming);
    expect(merged.items.map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it('preserves the base draft identity and provenance', () => {
    const merged = mergePlanDrafts(base, incoming);
    expect(merged.name).toBe('Knee rehab');
    expect(merged.sourceTemplateId).toBe('t1');
    expect(merged.templateId).toBe('t1');
    expect(merged.templateName).toBe('Knee rehab');
    expect(merged.patientName).toBe('Ada Lovelace');
  });

  it('does not mutate either input', () => {
    mergePlanDrafts(base, incoming);
    expect(base.items).toHaveLength(1);
    expect(incoming.items).toHaveLength(2);
    expect(base.items[0].order).toBeUndefined();
  });
});

describe('isExerciseInDraft', () => {
  it('detects an existing exercise id', () => {
    expect(isExerciseInDraft(items, 'knee-1')).toBe(true);
    expect(isExerciseInDraft(items, 'nope')).toBe(false);
  });
});

describe('validatePlanDraft', () => {
  it('accepts a valid draft', () => {
    expect(validatePlanDraft({ name: 'Plan', items })).toEqual([]);
  });

  it('requires a name and at least one item', () => {
    const errors = validatePlanDraft({ name: '  ', items: [] });
    expect(errors.map((e) => e.field)).toEqual(expect.arrayContaining(['name', 'items']));
  });

  it('surfaces per-item dosage errors keyed to the item', () => {
    const bad: PlanDraftItem[] = [{ exerciseId: 'x', sets: 3, reps: 99, hold: 0, rest: 30 }];
    const errors = validatePlanDraft({ name: 'Plan', items: bad });
    expect(errors.some((e) => e.field === 'items[0].reps')).toBe(true);
  });

  it('flags unknown exercise ids when a known set is supplied', () => {
    const errors = validatePlanDraft({ name: 'Plan', items }, new Set(['knee-1']));
    expect(errors.some((e) => e.field === 'items[1].exerciseId')).toBe(true);
  });
});
