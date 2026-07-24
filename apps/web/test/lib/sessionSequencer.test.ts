import { describe, expect, it } from 'vitest';
import {
  advanceSequencer,
  createSequencerState,
  currentExercise,
  exerciseResultAt,
  exerciseResults,
  isSequencerComplete,
  type SequencerEvent,
  type SequencerExercise,
  type SequencerState,
} from '../../src/lib/sessionSequencer';

const oneExercise: SequencerExercise[] = [
  { exerciseId: 'knee-1', name: 'Knee Raise', targetReps: 3, sets: 2, restSec: 30 },
];

const twoExercises: SequencerExercise[] = [
  { exerciseId: 'a', targetReps: 2, sets: 1, restSec: 0 },
  { exerciseId: 'b', targetReps: 2, sets: 1, restSec: 0 },
];

/** Apply a stream of events, returning the final state. */
function run(state: SequencerState, events: SequencerEvent[]): SequencerState {
  return events.reduce(advanceSequencer, state);
}

const rep = (sample = {}): SequencerEvent => ({ type: 'rep', ...sample });

describe('createSequencerState', () => {
  it('starts active on the first set of the first exercise', () => {
    const s = createSequencerState(oneExercise);
    expect(s.phase).toBe('active');
    expect(s.exerciseIndex).toBe(0);
    expect(s.setIndex).toBe(0);
    expect(s.repsInSet).toBe(0);
    expect(currentExercise(s)?.exerciseId).toBe('knee-1');
  });

  it('coerces out-of-range dosage to safe minimums', () => {
    const s = createSequencerState([
      { exerciseId: 'x', targetReps: 0, sets: 0, restSec: -5 },
    ]);
    expect(s.exercises[0]).toMatchObject({ targetReps: 1, sets: 1, restSec: 0 });
  });

  it('throws when given no exercises', () => {
    expect(() => createSequencerState([])).toThrow(/at least one exercise/);
  });
});

describe('auto-complete at target reps', () => {
  it('reaching the target completes the set and transitions to rest', () => {
    const s = run(createSequencerState(oneExercise), [rep(), rep(), rep()]);
    // Set 1 of 2 done → rest before set 2.
    expect(s.phase).toBe('resting');
    expect(s.setIndex).toBe(1);
    expect(s.repsInSet).toBe(0);
    expect(s.exerciseIndex).toBe(0);
  });

  it('reps arriving during rest are ignored (no overcount)', () => {
    const s = run(createSequencerState(oneExercise), [rep(), rep(), rep(), rep(), rep()]);
    expect(s.phase).toBe('resting');
    // Only the 3 reps of set 1 counted.
    expect(exerciseResultAt(s, 0)?.completedReps).toBe(3);
  });

  it('ending rest resumes the next set, and finishing the last set completes the exercise', () => {
    let s = run(createSequencerState(oneExercise), [rep(), rep(), rep()]);
    s = advanceSequencer(s, { type: 'endRest' });
    expect(s.phase).toBe('active');
    expect(s.setIndex).toBe(1);
    s = run(s, [rep(), rep(), rep()]);
    // Last set of the only exercise → complete (no rest after the final set).
    expect(isSequencerComplete(s)).toBe(true);
    expect(currentExercise(s)).toBeNull();
    expect(exerciseResultAt(s, 0)?.completedReps).toBe(6);
  });

  it('advances across exercises with no rest between them', () => {
    let s = createSequencerState(twoExercises);
    s = run(s, [rep(), rep()]); // exercise a, single set → done, advance to b
    expect(s.phase).toBe('active');
    expect(s.exerciseIndex).toBe(1);
    s = run(s, [rep(), rep()]); // exercise b done → complete
    expect(isSequencerComplete(s)).toBe(true);
  });
});

describe('manual override / Next parity', () => {
  it('completeSet finishes an under-target set, crediting only what was counted', () => {
    let s = createSequencerState(oneExercise); // target 3
    s = run(s, [rep(), { type: 'completeSet' }]); // only 1 rep, then force-complete
    expect(s.phase).toBe('resting'); // set 1 done → rest
    expect(s.setIndex).toBe(1);
    expect(exerciseResultAt(s, 0)?.completedReps).toBe(1);
  });

  it('auto-completing and manually completing a set land in the same position', () => {
    // Reaching the target auto-completes set 1; a manual completeSet after fewer
    // reps completes the same set. The positional outcome (phase/exercise/set)
    // is identical because both funnel through the one shared transition — only
    // the credited rep count differs.
    const auto = run(createSequencerState(oneExercise), [rep(), rep(), rep()]);
    const manual = run(createSequencerState(oneExercise), [rep(), { type: 'completeSet' }]);
    const position = (s: SequencerState) => ({
      phase: s.phase,
      exerciseIndex: s.exerciseIndex,
      setIndex: s.setIndex,
      repsInSet: s.repsInSet,
    });
    expect(position(auto)).toEqual(position(manual));
  });

  it("Next during rest skips the rest (identical to endRest)", () => {
    const rested = run(createSequencerState(oneExercise), [rep(), rep(), rep()]);
    expect(rested.phase).toBe('resting');
    const skipped = advanceSequencer(rested, { type: 'next' });
    const ended = advanceSequencer(rested, { type: 'endRest' });
    expect(skipped).toEqual(ended);
    expect(skipped.phase).toBe('active');
    expect(skipped.setIndex).toBe(1);
  });

  it('Next during an active set completes it (same as completeSet)', () => {
    const base = run(createSequencerState(oneExercise), [rep()]);
    const viaNext = advanceSequencer(base, { type: 'next' });
    const viaComplete = advanceSequencer(base, { type: 'completeSet' });
    expect(viaNext).toEqual(viaComplete);
  });

  it('events after completion are inert', () => {
    let s = run(createSequencerState(twoExercises), [rep(), rep(), rep(), rep()]);
    expect(isSequencerComplete(s)).toBe(true);
    const before = s;
    s = run(s, [rep(), { type: 'completeSet' }, { type: 'next' }, { type: 'endRest' }]);
    expect(s).toEqual(before);
  });
});

describe('aggregation matches the session schema', () => {
  it('averages form and takes the max ROM, ignoring unmeasured reps', () => {
    const s = run(createSequencerState([
      { exerciseId: 'k', targetReps: 4, sets: 1, restSec: 0 },
    ]), [
      rep({ formScore: 80, rom: 40 }),
      rep({ formScore: 100, rom: 55 }),
      rep({ formScore: null, rom: null }), // unmeasured (e.g. manual override rep)
      rep({ formScore: 90, rom: 50 }),
    ]);
    const result = exerciseResultAt(s, 0);
    expect(result).toEqual({
      exerciseId: 'k',
      completedReps: 4,
      avgFormScore: (80 + 100 + 90) / 3,
      maxRangeOfMotionDeg: 55,
    });
  });

  it('reports null form/ROM when nothing was measured', () => {
    const s = run(createSequencerState([
      { exerciseId: 'k', targetReps: 2, sets: 1, restSec: 0 },
    ]), [rep(), rep()]);
    expect(exerciseResultAt(s, 0)).toMatchObject({
      completedReps: 2,
      avgFormScore: null,
      maxRangeOfMotionDeg: null,
    });
  });

  it('exposes per-exercise results index-aligned with the exercise list', () => {
    const s = run(createSequencerState(twoExercises), [
      rep({ formScore: 70, rom: 30 }),
      rep({ formScore: 70, rom: 35 }),
      rep({ formScore: 90, rom: 45 }),
      rep({ formScore: 90, rom: 48 }),
    ]);
    const all = exerciseResults(s);
    expect(all.map((r) => r.exerciseId)).toEqual(['a', 'b']);
    expect(all[0].maxRangeOfMotionDeg).toBe(35);
    expect(all[1].maxRangeOfMotionDeg).toBe(48);
  });
});
