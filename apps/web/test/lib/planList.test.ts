import { describe, expect, it } from 'vitest';
import {
  duplicatePlanToDraft,
  filterPlansByQuery,
  planToEditDraft,
  sortPlansByUpdatedAt,
} from '../../src/lib/planList';
import type { Plan } from '../../src/types/plan';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    patientName: 'Ada Lovelace',
    templateId: 't1',
    templateName: 'Knee rehab',
    items: [{ exerciseId: 'a', sets: 3, reps: 10, hold: 0, rest: 30 }],
    updatedAt: '2024-03-01T10:00:00Z',
    ...overrides,
  };
}

describe('sortPlansByUpdatedAt', () => {
  it('orders newest-first and does not mutate the input', () => {
    const older = plan({ id: 'old', updatedAt: '2024-01-01T00:00:00Z' });
    const newer = plan({ id: 'new', updatedAt: '2024-05-01T00:00:00Z' });
    const input = [older, newer];
    const sorted = sortPlansByUpdatedAt(input);
    expect(sorted.map((p) => p.id)).toEqual(['new', 'old']);
    expect(input.map((p) => p.id)).toEqual(['old', 'new']);
  });

  it('sorts unparseable timestamps last', () => {
    const good = plan({ id: 'good', updatedAt: '2024-05-01T00:00:00Z' });
    const bad = plan({ id: 'bad', updatedAt: 'not-a-date' });
    expect(sortPlansByUpdatedAt([bad, good]).map((p) => p.id)).toEqual(['good', 'bad']);
  });
});

describe('filterPlansByQuery', () => {
  const ada = plan({ id: 'ada', patientName: 'Ada Lovelace', templateName: 'Knee rehab' });
  const bob = plan({ id: 'bob', patientName: 'Bob Stone', templateName: 'Shoulder mobility' });

  it('returns all plans for an empty/whitespace query', () => {
    expect(filterPlansByQuery([ada, bob], '   ')).toHaveLength(2);
  });

  it('matches by patient name (case-insensitive)', () => {
    expect(filterPlansByQuery([ada, bob], 'ada').map((p) => p.id)).toEqual(['ada']);
  });

  it('matches by template name', () => {
    expect(filterPlansByQuery([ada, bob], 'shoulder').map((p) => p.id)).toEqual(['bob']);
  });

  it('returns none when nothing matches', () => {
    expect(filterPlansByQuery([ada, bob], 'zzz')).toHaveLength(0);
  });
});

describe('planToEditDraft', () => {
  it('carries the plan id and patient so saving updates in place', () => {
    const draft = planToEditDraft(plan());
    expect(draft.id).toBe('p1');
    expect(draft.patientName).toBe('Ada Lovelace');
    expect(draft.templateId).toBe('t1');
    expect(draft.items).toHaveLength(1);
  });

  it('deep-copies items so editing the draft never mutates the source', () => {
    const source = plan();
    const draft = planToEditDraft(source);
    draft.items[0].sets = 99;
    expect(source.items[0].sets).toBe(3);
  });
});

describe('duplicatePlanToDraft', () => {
  it('clones items but drops the id and clears the patient', () => {
    const draft = duplicatePlanToDraft(plan());
    expect(draft.id).toBeUndefined();
    expect(draft.patientName).toBeUndefined();
    expect(draft.templateId).toBe('t1');
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].exerciseId).toBe('a');
  });

  it('deep-copies items so editing the duplicate never mutates the source', () => {
    const source = plan();
    const draft = duplicatePlanToDraft(source);
    draft.items[0].reps = 1;
    expect(source.items[0].reps).toBe(10);
  });
});
