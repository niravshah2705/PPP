import { describe, expect, it } from 'vitest';
import {
  appendExerciseToItems,
  defaultPlanDraftItem,
  isExerciseInDraft,
  nextPlanOrder,
  validatePlanDraft,
} from '../../src/lib/planDraft';
import type { Exercise } from '../../src/types/exercise';
import type { PlanDraftItem } from '../../src/types/template';

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
