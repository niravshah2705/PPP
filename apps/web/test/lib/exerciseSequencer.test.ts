import { describe, expect, it, vi } from 'vitest';
import {
  createExerciseSequencer,
  createSequencerState,
  currentItem,
  isComplete,
  reduceSequencer,
  type SequencerEvent,
  type SequencerItem,
  type SequencerState,
} from '../../src/lib/exerciseSequencer';

const oneExercise: SequencerItem[] = [
  {
    exerciseId: 'knee-1',
    name: 'Knee Raise',
    description: 'Lift and hold',
    sets: 2,
    targetReps: 3,
    holdSeconds: 0,
    restSeconds: 30,
  },
];

const twoExercises: SequencerItem[] = [
  { exerciseId: 'a', name: 'A', sets: 1, targetReps: 2, holdSeconds: 0, restSeconds: 0 },
  { exerciseId: 'b', name: 'B', sets: 1, targetReps: 2, holdSeconds: 0, restSeconds: 0 },
];

/** Apply a stream of events, returning the final state. */
function run(state: SequencerState, events: SequencerEvent[]): SequencerState {
  return events.reduce(reduceSequencer, state);
}

describe('createSequencerState', () => {
  it('starts idle on the first exercise', () => {
    const s = createSequencerState(oneExercise);
    expect(s.phase).toBe('idle');
    expect(s.exerciseIndex).toBe(0);
    expect(s.setIndex).toBe(0);
    expect(s.restRemaining).toBe(0);
    expect(currentItem(s)?.exerciseId).toBe('knee-1');
    expect(s.results.map((r) => r.outcome)).toEqual(['pending']);
  });

  it('coerces out-of-range dosage to safe minimums', () => {
    const s = createSequencerState([
      { exerciseId: 'x', name: 'X', sets: 0, targetReps: 0, holdSeconds: -5, restSeconds: -9 },
    ]);
    expect(s.items[0]).toMatchObject({ sets: 1, targetReps: 1, holdSeconds: 0, restSeconds: 0 });
  });

  it('throws when given no exercises', () => {
    expect(() => createSequencerState([])).toThrow(/at least one exercise/);
  });
});

describe('finite-state progression', () => {
  it('walks idle → instruction → active for the first exercise', () => {
    let s = createSequencerState(oneExercise);
    s = reduceSequencer(s, { type: 'start' });
    expect(s.phase).toBe('instruction');
    s = reduceSequencer(s, { type: 'begin' });
    expect(s.phase).toBe('active');
    expect(s.exerciseIndex).toBe(0);
    expect(s.setIndex).toBe(0);
  });

  it('completing a set with more sets left enters rest with restSeconds on the clock', () => {
    const s = run(createSequencerState(oneExercise), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'next' }, // completes set 1 of 2
    ]);
    expect(s.phase).toBe('rest');
    expect(s.setIndex).toBe(1);
    expect(s.restRemaining).toBe(30);
    expect(s.results[0]).toMatchObject({ outcome: 'pending', completedSets: 1 });
  });

  it('rolls straight into the next set (no rest) when restSeconds is 0', () => {
    const s = run(
      createSequencerState([
        { exerciseId: 'z', name: 'Z', sets: 2, targetReps: 1, holdSeconds: 0, restSeconds: 0 },
      ]),
      [{ type: 'start' }, { type: 'begin' }, { type: 'next' }],
    );
    expect(s.phase).toBe('active');
    expect(s.setIndex).toBe(1);
    expect(s.restRemaining).toBe(0);
  });

  it('advances set-by-set then exercise-by-exercise in order to completion', () => {
    const s = run(createSequencerState(oneExercise), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'next' }, // set 1 done → rest
      { type: 'skipRest' }, // resume set 2
      { type: 'next' }, // set 2 (last) done → next exercise (none) → complete
    ]);
    expect(s.phase).toBe('complete');
    expect(isComplete(s)).toBe(true);
    expect(s.exerciseIndex).toBe(1); // == items.length
    expect(currentItem(s)).toBeNull();
    expect(s.results[0]).toMatchObject({ outcome: 'completed', completedSets: 2 });
  });

  it('moves to the next exercise instruction after the last set of an exercise', () => {
    const s = run(createSequencerState(twoExercises), [
      { type: 'start' },
      { type: 'begin' }, // active a
      { type: 'next' }, // a is 1 set → completes exercise a → instruction b
    ]);
    expect(s.phase).toBe('instruction');
    expect(s.exerciseIndex).toBe(1);
    expect(currentItem(s)?.exerciseId).toBe('b');
    expect(s.results[0].outcome).toBe('completed');
  });
});

describe('rest timer', () => {
  it('ticks down and resumes the next set when it hits zero', () => {
    let s = run(createSequencerState(oneExercise), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'next' },
    ]);
    expect(s.phase).toBe('rest');
    s = reduceSequencer(s, { type: 'tick', seconds: 10 });
    expect(s.restRemaining).toBe(20);
    expect(s.phase).toBe('rest');
    s = reduceSequencer(s, { type: 'tick', seconds: 25 });
    expect(s.restRemaining).toBe(0);
    expect(s.phase).toBe('active');
  });

  it('defaults a tick to one second', () => {
    let s = run(createSequencerState(oneExercise), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'next' },
    ]);
    s = reduceSequencer(s, { type: 'tick' });
    expect(s.restRemaining).toBe(29);
  });

  it('skipRest resumes immediately', () => {
    let s = run(createSequencerState(oneExercise), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'next' },
    ]);
    s = reduceSequencer(s, { type: 'skipRest' });
    expect(s.phase).toBe('active');
    expect(s.restRemaining).toBe(0);
  });

  it('ignores ticks/skipRest outside a rest phase', () => {
    const s = createSequencerState(oneExercise);
    expect(reduceSequencer(s, { type: 'tick' })).toBe(s);
    expect(reduceSequencer(s, { type: 'skipRest' })).toBe(s);
  });
});

describe('skip', () => {
  it('records the current exercise as skipped and jumps to the next', () => {
    const s = run(createSequencerState(twoExercises), [{ type: 'start' }, { type: 'skip' }]);
    expect(s.results[0].outcome).toBe('skipped');
    expect(s.exerciseIndex).toBe(1);
    expect(s.phase).toBe('instruction');
    expect(currentItem(s)?.exerciseId).toBe('b');
  });

  it('skipping the last exercise transitions to the completion screen', () => {
    const s = run(createSequencerState(twoExercises), [
      { type: 'start' },
      { type: 'skip' }, // skip a → instruction b
      { type: 'skip' }, // skip b → complete
    ]);
    expect(s.phase).toBe('complete');
    expect(s.results.map((r) => r.outcome)).toEqual(['skipped', 'skipped']);
  });

  it('records skipped even mid-set', () => {
    const s = run(createSequencerState(twoExercises), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'skip' },
    ]);
    expect(s.results[0].outcome).toBe('skipped');
    expect(currentItem(s)?.exerciseId).toBe('b');
  });
});

describe('previous', () => {
  it('from an active set returns to that exercise’s instructions and resets progress', () => {
    let s = run(createSequencerState(oneExercise), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'next' }, // now resting after set 1
    ]);
    expect(s.results[0].completedSets).toBe(1);
    s = reduceSequencer(s, { type: 'previous' });
    expect(s.phase).toBe('instruction');
    expect(s.setIndex).toBe(0);
    expect(s.results[0]).toMatchObject({ outcome: 'pending', completedSets: 0 });
  });

  it('from an instruction screen goes back to the previous exercise', () => {
    let s = run(createSequencerState(twoExercises), [
      { type: 'start' },
      { type: 'begin' },
      { type: 'next' }, // completes a → instruction b
    ]);
    expect(s.exerciseIndex).toBe(1);
    s = reduceSequencer(s, { type: 'previous' });
    expect(s.exerciseIndex).toBe(0);
    expect(s.phase).toBe('instruction');
    expect(s.results[0]).toMatchObject({ outcome: 'pending', completedSets: 0 });
  });

  it('is a no-op on the very first instruction screen', () => {
    const s = run(createSequencerState(twoExercises), [{ type: 'start' }]);
    expect(reduceSequencer(s, { type: 'previous' })).toBe(s);
  });
});

describe('determinism + resilience to rapid presses', () => {
  it('ignores events that do not apply to the current phase (no double-advance)', () => {
    const s = createSequencerState(oneExercise);
    // begin/next/previous/skip before start are guarded no-ops.
    expect(reduceSequencer(s, { type: 'begin' })).toBe(s);
    expect(reduceSequencer(s, { type: 'previous' })).toBe(s);
    expect(reduceSequencer(s, { type: 'skipRest' })).toBe(s);
  });

  it('rapid double-next during a set only completes one set', () => {
    const three = createSequencerState([
      { exerciseId: 'm', name: 'M', sets: 3, targetReps: 1, holdSeconds: 0, restSeconds: 5 },
    ]);
    let s = run(three, [{ type: 'start' }, { type: 'begin' }]);
    s = reduceSequencer(s, { type: 'next' }); // set 1 → rest
    const resting = s;
    // A second immediate "next" only skips the rest; it does not complete set 2.
    s = reduceSequencer(s, { type: 'next' });
    expect(resting.phase).toBe('rest');
    expect(s.phase).toBe('active');
    expect(s.setIndex).toBe(1);
  });

  it('a completed sequence ignores further control events', () => {
    const s = run(createSequencerState(twoExercises), [
      { type: 'start' },
      { type: 'skip' },
      { type: 'skip' },
    ]);
    expect(s.phase).toBe('complete');
    for (const type of ['next', 'begin', 'previous', 'skip', 'skipRest', 'start'] as const) {
      expect(reduceSequencer(s, { type })).toBe(s);
    }
  });
});

describe('observable store', () => {
  it('notifies subscribers only on real state changes', () => {
    const store = createExerciseSequencer(oneExercise);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.start();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().phase).toBe('instruction');

    // A guarded no-op (skipRest while not resting) must not notify.
    store.skipRest();
    expect(listener).toHaveBeenCalledTimes(1);

    store.begin();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState().phase).toBe('active');

    unsubscribe();
    store.next();
    expect(listener).toHaveBeenCalledTimes(2); // no more notifications after unsubscribe
  });

  it('drives a full session through the action API', () => {
    const store = createExerciseSequencer(twoExercises);
    store.start();
    store.begin();
    store.next(); // finishes a → instruction b
    store.begin();
    store.next(); // finishes b → complete
    expect(store.getState().phase).toBe('complete');
    expect(store.getState().results.map((r) => r.outcome)).toEqual(['completed', 'completed']);
  });
});
