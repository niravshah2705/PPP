import { describe, expect, it } from 'vitest';
import { buildPlanOverview, formatItemDosage } from '../../src/lib/planOverview';
import type { SharedPlan, SharedPlanItem } from '../../src/types/sharedPlan';

function item(over: Partial<SharedPlanItem> = {}): SharedPlanItem {
  return {
    exerciseId: over.exerciseId ?? 'ex',
    sets: over.sets ?? 3,
    reps: over.reps ?? 10,
    hold: over.hold ?? 0,
    rest: over.rest ?? 30,
    order: over.order,
    exercise: over.exercise ?? { id: over.exerciseId ?? 'ex', name: 'Exercise' },
  };
}

function plan(items: SharedPlanItem[]): SharedPlan {
  return { id: 'plan-1', patientName: 'Ada Lovelace', items };
}

describe('formatItemDosage', () => {
  it('formats a rep target as "sets × reps reps"', () => {
    expect(formatItemDosage({ sets: 3, reps: 10, hold: 0 })).toBe('3 × 10 reps');
  });

  it('singularises a one-rep target', () => {
    expect(formatItemDosage({ sets: 2, reps: 1, hold: 0 })).toBe('2 × 1 rep');
  });

  it('formats a hold target as "sets × Ns hold" when hold is positive', () => {
    expect(formatItemDosage({ sets: 3, reps: 10, hold: 5 })).toBe('3 × 5s hold');
  });
});

describe('buildPlanOverview', () => {
  it('carries the patient name and exercise count', () => {
    const overview = buildPlanOverview(plan([item(), item({ exerciseId: 'b' })]));
    expect(overview.patientName).toBe('Ada Lovelace');
    expect(overview.exerciseCount).toBe(2);
    expect(overview.planId).toBe('plan-1');
  });

  it('orders items by explicit order, falling back to array position', () => {
    const overview = buildPlanOverview(
      plan([
        item({ exerciseId: 'second', order: 1, exercise: { id: 'second', name: 'Second' } }),
        item({ exerciseId: 'first', order: 0, exercise: { id: 'first', name: 'First' } }),
      ]),
    );
    expect(overview.items.map((i) => i.exerciseId)).toEqual(['first', 'second']);
  });

  it('exposes the exercise description as a per-exercise note', () => {
    const overview = buildPlanOverview(
      plan([item({ exercise: { id: 'ex', name: 'Quad set', description: 'Tighten the thigh.' } })]),
    );
    expect(overview.items[0].note).toBe('Tighten the thigh.');
    expect(overview.items[0].name).toBe('Quad set');
  });

  it('omits an empty/whitespace note', () => {
    const overview = buildPlanOverview(
      plan([item({ exercise: { id: 'ex', name: 'Quad set', description: '   ' } })]),
    );
    expect(overview.items[0].note).toBeUndefined();
  });

  it('flags hold-based movements and labels dosage accordingly', () => {
    const overview = buildPlanOverview(plan([item({ hold: 5 })]));
    expect(overview.items[0].isHold).toBe(true);
    expect(overview.items[0].dosageLabel).toBe('3 × 5s hold');
  });

  it('computes the estimated total duration from sets/reps/hold/rest', () => {
    // 3 sets × (10 reps × 3s + 5s hold) + 2 rests × 30s = 3×35 + 60 = 165s = 2m 45s
    const overview = buildPlanOverview(plan([item({ sets: 3, reps: 10, hold: 5, rest: 30 })]));
    expect(overview.totalDurationSeconds).toBe(165);
    expect(overview.totalDurationLabel).toBe('2m 45s');
    expect(overview.items[0].durationSeconds).toBe(165);
  });

  it('sums duration across multiple items', () => {
    const overview = buildPlanOverview(
      plan([
        item({ sets: 1, reps: 10, hold: 0, rest: 0 }), // 30s
        item({ sets: 1, reps: 5, hold: 0, rest: 0, exerciseId: 'b' }), // 15s
      ]),
    );
    expect(overview.totalDurationSeconds).toBe(45);
  });

  it('handles a zero-item plan (empty overview, 0s duration)', () => {
    const overview = buildPlanOverview(plan([]));
    expect(overview.exerciseCount).toBe(0);
    expect(overview.items).toEqual([]);
    expect(overview.totalDurationSeconds).toBe(0);
  });
});
