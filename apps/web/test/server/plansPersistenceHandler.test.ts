import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../src/types/exercise';
import type { ErrorEnvelope } from '../../src/types/errorEnvelope';
import type { PlanInput, StoredPlan } from '../../src/types/storedPlan';
import {
  PLAN_NOT_FOUND_CODE,
  PLAN_VALIDATION_CODE,
  type ValidationErrorBody,
  handleCreatePlan,
  handleGetPlan,
  handleListPlans,
  handleUpdatePlan,
} from '../../src/server/plansPersistenceHandler';
import { InMemoryPlanStore } from '../../src/server/planStore';
import type { PlanPersistenceDeps } from '../../src/server/plansPersistenceHandler';

const exercises: Exercise[] = [
  { id: 'ex-1', name: 'Exercise One' },
  { id: 'ex-2', name: 'Exercise Two' },
  { id: 'ex-3', name: 'Exercise Three' },
];

/**
 * Build a deps object with a fresh store, a fixed clock, and a deterministic id
 * generator so create/update behaviour is fully assertable.
 */
function makeDeps(overrides: Partial<PlanPersistenceDeps> = {}): PlanPersistenceDeps {
  let seq = 0;
  const times = ['2024-01-01T00:00:00.000Z', '2024-02-02T00:00:00.000Z', '2024-03-03T00:00:00.000Z'];
  let tick = 0;
  return {
    store: new InMemoryPlanStore(),
    exercises,
    generateId: () => `plan-${++seq}`,
    now: () => times[Math.min(tick++, times.length - 1)],
    ...overrides,
  };
}

function validInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    patientName: 'Ada Lovelace',
    sourceTemplateId: 'tmpl-1',
    notes: 'Twice daily',
    items: [
      { exerciseId: 'ex-1', sets: 3, reps: 10, holdSeconds: 5, restSeconds: 30, order: 0 },
      { exerciseId: 'ex-2', sets: 2, reps: 12, holdSeconds: 0, restSeconds: 45, order: 1 },
    ],
    ...overrides,
  };
}

describe('handleCreatePlan (POST /api/plans)', () => {
  it('returns 201 with a server id and server-set timestamps for a valid body', () => {
    const deps = makeDeps();
    const res = handleCreatePlan(validInput(), deps) as { status: number; body: StoredPlan };

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('plan-1');
    expect(res.body.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(res.body.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(res.body.patientName).toBe('Ada Lovelace');
    expect(res.body.sourceTemplateId).toBe('tmpl-1');
    expect(res.body.notes).toBe('Twice daily');
    expect(res.body.items).toHaveLength(2);

    // Persisted and resolvable by the generated id.
    const fetched = handleGetPlan('plan-1', deps) as { status: number; body: StoredPlan };
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe('plan-1');
  });

  it('ignores any client-supplied id/timestamps and uses server values', () => {
    const deps = makeDeps();
    const res = handleCreatePlan(
      { ...validInput(), id: 'client-id', createdAt: 'nope', updatedAt: 'nope' } as PlanInput & Record<string, unknown>,
      deps,
    ) as { status: number; body: StoredPlan };

    expect(res.body.id).toBe('plan-1');
    expect(res.body.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('sorts items by order regardless of input order', () => {
    const deps = makeDeps();
    const res = handleCreatePlan(
      validInput({
        items: [
          { exerciseId: 'ex-2', sets: 2, reps: 12, holdSeconds: 0, restSeconds: 45, order: 2 },
          { exerciseId: 'ex-1', sets: 3, reps: 10, holdSeconds: 5, restSeconds: 30, order: 0 },
          { exerciseId: 'ex-3', sets: 1, reps: 8, holdSeconds: 3, restSeconds: 20, order: 1 },
        ],
      }),
      deps,
    ) as { status: number; body: StoredPlan };

    expect(res.body.items.map((i) => i.exerciseId)).toEqual(['ex-1', 'ex-3', 'ex-2']);
    expect(res.body.items.map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it('rejects out-of-range sets/reps/hold with 400 per-field messages and persists nothing', () => {
    const deps = makeDeps();
    const res = handleCreatePlan(
      validInput({
        items: [
          { exerciseId: 'ex-1', sets: 11, reps: 99, holdSeconds: 200, restSeconds: 30, order: 0 },
        ],
      }),
      deps,
    ) as { status: number; body: ValidationErrorBody };

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(PLAN_VALIDATION_CODE);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain('items[0].sets');
    expect(fields).toContain('items[0].reps');
    expect(fields).toContain('items[0].holdSeconds');
    // Every error carries a human-readable message.
    for (const err of res.body.errors) expect(err.message).toBeTruthy();

    // Nothing persisted.
    expect(handleListPlans(undefined, deps).body).toHaveLength(0);
  });

  it('rejects an unknown exerciseId with 400 and persists nothing', () => {
    const deps = makeDeps();
    const res = handleCreatePlan(
      validInput({
        items: [{ exerciseId: 'ghost', sets: 3, reps: 10, holdSeconds: 5, restSeconds: 30, order: 0 }],
      }),
      deps,
    ) as { status: number; body: ValidationErrorBody };

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'items[0].exerciseId')).toBe(true);
    expect(handleListPlans(undefined, deps).body).toHaveLength(0);
  });

  it('rejects an empty items array with 400', () => {
    const deps = makeDeps();
    const res = handleCreatePlan(validInput({ items: [] }), deps) as {
      status: number;
      body: ValidationErrorBody;
    };

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'items')).toBe(true);
    expect(handleListPlans(undefined, deps).body).toHaveLength(0);
  });

  it('rejects a missing patient name with 400', () => {
    const deps = makeDeps();
    const res = handleCreatePlan(validInput({ patientName: '   ' }), deps) as {
      status: number;
      body: ValidationErrorBody;
    };

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'patientName')).toBe(true);
  });
});

describe('handleGetPlan (GET /api/plans/:id)', () => {
  it('returns 200 with items in order', () => {
    const deps = makeDeps();
    handleCreatePlan(
      validInput({
        items: [
          { exerciseId: 'ex-2', sets: 2, reps: 12, holdSeconds: 0, restSeconds: 45, order: 1 },
          { exerciseId: 'ex-1', sets: 3, reps: 10, holdSeconds: 5, restSeconds: 30, order: 0 },
        ],
      }),
      deps,
    );

    const res = handleGetPlan('plan-1', deps) as { status: number; body: StoredPlan };
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.order)).toEqual([0, 1]);
    expect(res.body.items.map((i) => i.exerciseId)).toEqual(['ex-1', 'ex-2']);
  });

  it('returns 404 with an error envelope for an unknown id', () => {
    const deps = makeDeps();
    const res = handleGetPlan('nope', deps) as { status: number; body: ErrorEnvelope };
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(PLAN_NOT_FOUND_CODE);
    expect(res.body.error.message).toContain('nope');
  });
});

describe('handleListPlans (GET /api/plans?patientName=)', () => {
  it('matches patientName case-insensitively', () => {
    const deps = makeDeps();
    handleCreatePlan(validInput({ patientName: 'Ada Lovelace' }), deps);
    handleCreatePlan(validInput({ patientName: 'Grace Hopper' }), deps);

    const res = handleListPlans('ADA lovelace', deps);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].patientName).toBe('Ada Lovelace');
  });

  it('lists every plan when no patientName is provided', () => {
    const deps = makeDeps();
    handleCreatePlan(validInput({ patientName: 'Ada Lovelace' }), deps);
    handleCreatePlan(validInput({ patientName: 'Grace Hopper' }), deps);

    expect(handleListPlans(undefined, deps).body).toHaveLength(2);
    expect(handleListPlans('', deps).body).toHaveLength(2);
  });

  it('returns an empty list for a patient with no plans', () => {
    const deps = makeDeps();
    handleCreatePlan(validInput({ patientName: 'Ada Lovelace' }), deps);
    expect(handleListPlans('Nobody', deps).body).toHaveLength(0);
  });
});

describe('handleUpdatePlan (PUT /api/plans/:id)', () => {
  it('replaces items/notes, keeps createdAt, and bumps updatedAt', () => {
    const deps = makeDeps();
    handleCreatePlan(validInput(), deps); // plan-1 @ times[0]

    const res = handleUpdatePlan(
      'plan-1',
      validInput({
        notes: 'Once daily now',
        items: [{ exerciseId: 'ex-3', sets: 1, reps: 5, holdSeconds: 2, restSeconds: 15, order: 0 }],
      }),
      deps,
    ) as { status: number; body: StoredPlan };

    expect(res.status).toBe(200);
    expect(res.body.createdAt).toBe('2024-01-01T00:00:00.000Z'); // preserved
    expect(res.body.updatedAt).toBe('2024-02-02T00:00:00.000Z'); // bumped
    expect(res.body.notes).toBe('Once daily now');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].exerciseId).toBe('ex-3');

    // Persisted.
    const fetched = handleGetPlan('plan-1', deps) as { status: number; body: StoredPlan };
    expect(fetched.body.items[0].exerciseId).toBe('ex-3');
    expect(fetched.body.updatedAt).toBe('2024-02-02T00:00:00.000Z');
  });

  it('re-validates on update: out-of-range values return 400 and persist nothing', () => {
    const deps = makeDeps();
    handleCreatePlan(validInput(), deps); // plan-1

    const res = handleUpdatePlan(
      'plan-1',
      validInput({
        items: [{ exerciseId: 'ex-1', sets: 0, reps: 10, holdSeconds: 5, restSeconds: 30, order: 0 }],
      }),
      deps,
    ) as { status: number; body: ValidationErrorBody };

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'items[0].sets')).toBe(true);

    // Original items untouched.
    const fetched = handleGetPlan('plan-1', deps) as { status: number; body: StoredPlan };
    expect(fetched.body.items).toHaveLength(2);
    expect(fetched.body.items[0].exerciseId).toBe('ex-1');
    expect(fetched.body.items[1].exerciseId).toBe('ex-2');
  });

  it('rejects an empty items array on update with 400', () => {
    const deps = makeDeps();
    handleCreatePlan(validInput(), deps);
    const res = handleUpdatePlan('plan-1', validInput({ items: [] }), deps) as {
      status: number;
      body: ValidationErrorBody;
    };
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'items')).toBe(true);
  });

  it('returns 404 for an unknown id (checked before validation)', () => {
    const deps = makeDeps();
    // Even an invalid payload against an unknown id is a 404, not a 400.
    const res = handleUpdatePlan('missing', validInput({ items: [] }), deps) as {
      status: number;
      body: ErrorEnvelope;
    };
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(PLAN_NOT_FOUND_CODE);
    expect(res.body.error.message).toContain('missing');
  });
});
