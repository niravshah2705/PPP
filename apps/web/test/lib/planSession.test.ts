import { describe, expect, it } from 'vitest';
import {
  findResumableSession,
  planToSequencerExercises,
  sharedPlanToSequencerItems,
} from '../../src/lib/planSession';
import type { Plan } from '../../src/types/plan';
import type { Session } from '../../src/types/session';
import type { SharedPlan } from '../../src/types/sharedPlan';

function plan(items: Plan['items']): Plan {
  return { id: 'p1', patientName: 'Jamie', items, updatedAt: '2024-01-01T00:00:00.000Z' };
}

function session(over: Partial<Session>): Session {
  return {
    id: 's',
    planId: 'p1',
    date: '2024-01-01T00:00:00.000Z',
    completionPct: 0,
    avgForm: null,
    exercises: [],
    ...over,
  };
}

describe('planToSequencerExercises', () => {
  it('maps dosage items to sequencer exercises (reps→target, rest→restSec)', () => {
    const seq = planToSequencerExercises(
      plan([{ exerciseId: 'a', sets: 3, reps: 12, hold: 0, rest: 30 }]),
    );
    expect(seq).toEqual([{ exerciseId: 'a', targetReps: 12, sets: 3, restSec: 30 }]);
  });

  it('orders by explicit order, falling back to array position', () => {
    const seq = planToSequencerExercises(
      plan([
        { exerciseId: 'second', sets: 1, reps: 5, hold: 0, rest: 0, order: 2 },
        { exerciseId: 'first', sets: 1, reps: 5, hold: 0, rest: 0, order: 1 },
      ]),
    );
    expect(seq.map((e) => e.exerciseId)).toEqual(['first', 'second']);
  });

  it('returns an empty list for a plan with no items', () => {
    expect(planToSequencerExercises(plan([]))).toEqual([]);
  });
});

describe('sharedPlanToSequencerItems', () => {
  function shared(items: SharedPlan['items']): SharedPlan {
    return { id: 'p1', patientName: 'Jamie', items };
  }

  it('expands resolved exercises into instruction-screen items in play order', () => {
    const seq = sharedPlanToSequencerItems(
      shared([
        {
          exerciseId: 'b',
          sets: 2,
          reps: 8,
          hold: 0,
          rest: 20,
          order: 2,
          exercise: { id: 'b', name: 'B', description: 'do b', thumbnailUrl: 'b.png' },
        },
        {
          exerciseId: 'a',
          sets: 1,
          reps: 5,
          hold: 15,
          rest: 0,
          order: 1,
          exercise: { id: 'a', name: 'A', demoMediaRef: 'a.mp4' },
        },
      ]),
    );
    expect(seq).toEqual([
      {
        exerciseId: 'a',
        name: 'A',
        description: undefined,
        demoMediaRef: 'a.mp4',
        thumbnailUrl: undefined,
        sets: 1,
        targetReps: 5,
        holdSeconds: 15,
        restSeconds: 0,
      },
      {
        exerciseId: 'b',
        name: 'B',
        description: 'do b',
        demoMediaRef: undefined,
        thumbnailUrl: 'b.png',
        sets: 2,
        targetReps: 8,
        holdSeconds: 0,
        restSeconds: 20,
      },
    ]);
  });

  it('falls back to the demo clip when there is no dedicated media ref', () => {
    const [item] = sharedPlanToSequencerItems(
      shared([
        {
          exerciseId: 'a',
          sets: 1,
          reps: 1,
          hold: 0,
          rest: 0,
          exercise: { id: 'a', name: 'A', demoClip: 'clip-1' },
        },
      ]),
    );
    expect(item.demoMediaRef).toBe('clip-1');
  });
});

describe('findResumableSession', () => {
  it('returns null when nothing is in progress', () => {
    expect(
      findResumableSession([session({ id: 'a', status: 'completed' }), session({ id: 'b' })]),
    ).toBeNull();
  });

  it('returns the in-progress session left by a closed tab', () => {
    const found = findResumableSession([
      session({ id: 'done', status: 'completed' }),
      session({ id: 'open', status: 'in_progress' }),
    ]);
    expect(found?.id).toBe('open');
  });

  it('prefers the most recently started in-progress session', () => {
    const found = findResumableSession([
      session({ id: 'old', status: 'in_progress', startedAt: '2024-01-01T00:00:00.000Z' }),
      session({ id: 'new', status: 'in_progress', startedAt: '2024-03-01T00:00:00.000Z' }),
    ]);
    expect(found?.id).toBe('new');
  });
});
