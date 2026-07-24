import { describe, expect, it } from 'vitest';
import {
  SessionConflictError,
  SessionNotFoundError,
  SessionStore,
  SessionValidationError,
  type SessionStoreOptions,
} from '../../src/lib/sessionStore';

const KNOWN_PLANS = new Set(['plan-1', 'plan-2']);

/**
 * Build a store with a deterministic clock (a queue of ISO timestamps consumed
 * in order, then a stable fallback) and sequential ids, so ordering and
 * server-set timestamps are assertable.
 */
function makeStore(times: string[] = [], overrides: Partial<SessionStoreOptions> = {}) {
  const queue = [...times];
  let last = '2024-01-01T00:00:00.000Z';
  let n = 0;
  return new SessionStore({
    planExists: (id) => KNOWN_PLANS.has(id),
    now: () => (queue.length ? (last = queue.shift()!) : last),
    newId: () => `sess-${(n += 1)}`,
    ...overrides,
  });
}

describe('SessionStore.create', () => {
  it('opens a session in_progress with a server-set startedAt and no completedAt', () => {
    const store = makeStore(['2024-05-01T10:00:00.000Z']);
    const s = store.create({ planId: 'plan-1', patientName: 'Jamie' });

    expect(s).toMatchObject({
      id: 'sess-1',
      planId: 'plan-1',
      patientName: 'Jamie',
      status: 'in_progress',
      startedAt: '2024-05-01T10:00:00.000Z',
      results: [],
    });
    expect(s.completedAt).toBeUndefined();
  });

  it('defaults patientName to an empty string when omitted', () => {
    const store = makeStore();
    expect(store.create({ planId: 'plan-1' }).patientName).toBe('');
  });

  it('rejects an unknown planId with a 400 validation error', () => {
    const store = makeStore();
    expect(() => store.create({ planId: 'nope' })).toThrow(SessionValidationError);
    try {
      store.create({ planId: 'nope' });
    } catch (err) {
      expect((err as SessionValidationError).status).toBe(400);
    }
  });

  it('rejects a blank planId with a 400', () => {
    const store = makeStore();
    expect(() => store.create({ planId: '  ' })).toThrow(SessionValidationError);
  });

  it('normalises seed results (clamps score to 0–100 and reps to >= 0)', () => {
    const store = makeStore();
    const s = store.create({
      planId: 'plan-1',
      results: [
        {
          exerciseId: 'knee-flex',
          targetReps: -5,
          completedReps: 3,
          avgFormScore: 140,
          maxRangeOfMotionDeg: -2,
          durationSeconds: 30,
        },
      ],
    });
    expect(s.results[0]).toEqual({
      exerciseId: 'knee-flex',
      targetReps: 0,
      completedReps: 3,
      avgFormScore: 100,
      maxRangeOfMotionDeg: 0,
      durationSeconds: 30,
    });
  });

  it('does not expose the internal record (returned copy is detached)', () => {
    const store = makeStore();
    const created = store.create({ planId: 'plan-1', results: [{ exerciseId: 'a' }] });
    created.results[0].completedReps = 999;
    created.status = 'completed';
    expect(store.get(created.id).results[0].completedReps).toBe(0);
    expect(store.get(created.id).status).toBe('in_progress');
  });
});

describe('SessionStore.patch', () => {
  it('appends a new exercise result', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    const s = store.patch(id, {
      results: [{ exerciseId: 'a', targetReps: 10, completedReps: 8, avgFormScore: 82 }],
    });
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toMatchObject({ exerciseId: 'a', completedReps: 8, avgFormScore: 82 });
  });

  it('merges by exerciseId — updates supplied fields, keeps the rest', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    store.patch(id, {
      results: [{ exerciseId: 'a', targetReps: 10, completedReps: 4, avgFormScore: 70 }],
    });
    const s = store.patch(id, { results: [{ exerciseId: 'a', completedReps: 9 }] });
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toEqual({
      exerciseId: 'a',
      targetReps: 10, // preserved
      completedReps: 9, // updated
      avgFormScore: 70, // preserved
      maxRangeOfMotionDeg: 0,
      durationSeconds: 0,
    });
  });

  it('keeps multiple exercises and appends unseen ones in order', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    store.patch(id, { results: [{ exerciseId: 'a' }, { exerciseId: 'b' }] });
    const s = store.patch(id, { results: [{ exerciseId: 'c' }, { exerciseId: 'a' }] });
    expect(s.results.map((r) => r.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  it('clamps scores to 0–100 and reps/measurements to >= 0 on patch', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    const s = store.patch(id, {
      results: [
        {
          exerciseId: 'a',
          completedReps: -3,
          avgFormScore: -20,
          maxRangeOfMotionDeg: -1,
          durationSeconds: -5,
        },
      ],
    });
    expect(s.results[0]).toMatchObject({
      completedReps: 0,
      avgFormScore: 0,
      maxRangeOfMotionDeg: 0,
      durationSeconds: 0,
    });
  });

  it('rejects a non-finite score with a 400', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    expect(() => store.patch(id, { results: [{ exerciseId: 'a', avgFormScore: NaN }] })).toThrow(
      SessionValidationError,
    );
  });

  it('finalises with status=completed and a server-set completedAt when omitted', () => {
    const store = makeStore(['2024-05-01T10:00:00.000Z', '2024-05-01T10:30:00.000Z']);
    const { id } = store.create({ planId: 'plan-1' });
    const s = store.patch(id, { status: 'completed' });
    expect(s.status).toBe('completed');
    expect(s.completedAt).toBe('2024-05-01T10:30:00.000Z');
  });

  it('honours an explicit completedAt when finalising', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    const s = store.patch(id, {
      status: 'completed',
      completedAt: '2024-06-15T09:00:00.000Z',
      results: [{ exerciseId: 'a', completedReps: 10, avgFormScore: 95 }],
    });
    expect(s).toMatchObject({ status: 'completed', completedAt: '2024-06-15T09:00:00.000Z' });
    expect(s.results[0].completedReps).toBe(10);
  });

  it('allows partial results when abandoning a session', () => {
    const store = makeStore(['2024-05-01T10:00:00.000Z', '2024-05-01T10:05:00.000Z']);
    const { id } = store.create({ planId: 'plan-1' });
    store.patch(id, { results: [{ exerciseId: 'a', completedReps: 2 }] });
    const s = store.patch(id, { status: 'abandoned' });
    expect(s.status).toBe('abandoned');
    expect(s.completedAt).toBe('2024-05-01T10:05:00.000Z');
    expect(s.results).toHaveLength(1);
  });

  it('returns 409 when patching an already-completed session', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    store.patch(id, { status: 'completed' });
    try {
      store.patch(id, { results: [{ exerciseId: 'a' }] });
      throw new Error('expected a conflict');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionConflictError);
      expect((err as SessionConflictError).status).toBe(409);
    }
  });

  it('returns 409 when patching an already-abandoned session', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    store.patch(id, { status: 'abandoned' });
    expect(() => store.patch(id, { status: 'completed' })).toThrow(SessionConflictError);
  });

  it('returns 404 when patching an unknown session', () => {
    const store = makeStore();
    expect(() => store.patch('ghost', { results: [] })).toThrow(SessionNotFoundError);
  });

  it('rejects an unknown status value with a 400', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    // @ts-expect-error — exercising runtime validation of a bad status.
    expect(() => store.patch(id, { status: 'paused' })).toThrow(SessionValidationError);
  });
});

describe('SessionStore.listByPlan', () => {
  it('returns only the plan sessions, newest-first by startedAt', () => {
    const store = makeStore([
      '2024-05-01T10:00:00.000Z', // sess-1 plan-1
      '2024-05-03T10:00:00.000Z', // sess-2 plan-1
      '2024-05-02T10:00:00.000Z', // sess-3 plan-2
      '2024-05-04T10:00:00.000Z', // sess-4 plan-1
    ]);
    store.create({ planId: 'plan-1' });
    store.create({ planId: 'plan-1' });
    store.create({ planId: 'plan-2' });
    store.create({ planId: 'plan-1' });

    const ids = store.listByPlan('plan-1').map((s) => s.id);
    expect(ids).toEqual(['sess-4', 'sess-2', 'sess-1']);
  });

  it('breaks startedAt ties by insertion order (latest first)', () => {
    const store = makeStore(['2024-05-01T10:00:00.000Z', '2024-05-01T10:00:00.000Z']);
    store.create({ planId: 'plan-1' }); // sess-1
    store.create({ planId: 'plan-1' }); // sess-2, same startedAt
    expect(store.listByPlan('plan-1').map((s) => s.id)).toEqual(['sess-2', 'sess-1']);
  });

  it('returns an empty array for a plan with no sessions', () => {
    const store = makeStore();
    expect(store.listByPlan('plan-2')).toEqual([]);
  });
});

describe('SessionStore.get', () => {
  it('returns the full session with all results', () => {
    const store = makeStore();
    const { id } = store.create({ planId: 'plan-1' });
    store.patch(id, {
      results: [
        { exerciseId: 'a', targetReps: 10, completedReps: 9, avgFormScore: 88, durationSeconds: 40 },
        { exerciseId: 'b', targetReps: 12, completedReps: 12, maxRangeOfMotionDeg: 130 },
      ],
    });
    const s = store.get(id);
    expect(s.results).toHaveLength(2);
    expect(s.results[1]).toMatchObject({ exerciseId: 'b', maxRangeOfMotionDeg: 130 });
  });

  it('returns 404 for an unknown id', () => {
    const store = makeStore();
    try {
      store.get('ghost');
      throw new Error('expected not found');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionNotFoundError);
      expect((err as SessionNotFoundError).status).toBe(404);
    }
  });
});
