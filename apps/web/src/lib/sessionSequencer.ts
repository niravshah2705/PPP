/**
 * Session sequencer — the state machine that turns tracked rep events into set
 * progression and, ultimately, the per-exercise results persisted to a session.
 *
 * It closes the monitoring loop: the rep counter's per-rep signal drives set
 * completion, sets auto-advance to rest and then the next set/exercise, and the
 * form/ROM measured for each rep is aggregated into exactly the shape the
 * session PATCH (and downstream review screens) expect.
 *
 * The module is intentionally pure — no React, no I/O — so the transition logic
 * is exhaustively testable and can be shared by the player hook. Crucially the
 * auto-advance-at-target path and the manual "Next"/"Complete set" override
 * funnel through the SAME `completeCurrentSet` transition, so downstream data is
 * identical no matter how a set finished.
 */

/** One exercise the sequencer walks the patient through, with its dosage. */
export interface SequencerExercise {
  /** Stable exercise id (matches the plan/exercise catalogue). */
  exerciseId: string;
  /** Human-readable name, surfaced by the player chrome. */
  name?: string;
  /** Reps that complete one set (coerced to at least 1). */
  targetReps: number;
  /** Number of sets to perform (coerced to at least 1). */
  sets: number;
  /** Rest seconds between sets (coerced to >= 0). No rest follows the last set. */
  restSec: number;
}

/**
 * Where the sequencer currently is:
 * - `active`   — performing a set; rep events count toward the target.
 * - `resting`  — a set just completed and a rest interval is pending.
 * - `complete` — every set of every exercise is done.
 */
export type SequencerPhase = 'active' | 'resting' | 'complete';

/** Running per-exercise aggregate, index-aligned with `SequencerState.exercises`. */
interface ExerciseAccumulator {
  completedReps: number;
  formSum: number;
  formCount: number;
  maxRom: number | null;
}

/** Immutable snapshot of the sequencer. Never mutate — always reduce. */
export interface SequencerState {
  readonly exercises: readonly SequencerExercise[];
  /** Index of the exercise in progress (== exercises.length when complete). */
  readonly exerciseIndex: number;
  /** 0-based set index within the current exercise. */
  readonly setIndex: number;
  /** Reps counted in the current set so far. */
  readonly repsInSet: number;
  readonly phase: SequencerPhase;
  readonly accumulators: readonly ExerciseAccumulator[];
}

/** Per-rep measurement fed in with a rep event. Missing values are "not measured". */
export interface RepSample {
  /** Per-rep form score 0–100, or null/undefined when not measured. */
  formScore?: number | null;
  /** Per-rep range-of-motion (degrees), or null/undefined when not measured. */
  rom?: number | null;
}

/**
 * Events the sequencer accepts.
 * - `rep`         — one tracked (or manually counted) rep, with optional form/ROM.
 * - `completeSet` — manual override: finish the current set now (stalled tracking).
 * - `next`        — manual "Next": completes an active set, or skips a pending rest.
 * - `endRest`     — the rest interval elapsed; resume the next set.
 */
export type SequencerEvent =
  | ({ type: 'rep' } & RepSample)
  | { type: 'completeSet' }
  | { type: 'next' }
  | { type: 'endRest' };

/** Per-exercise result in the exact shape recorded by the session PATCH. */
export interface TrackedExerciseResult {
  exerciseId: string;
  /** Reps the patient actually completed across all sets. */
  completedReps: number;
  /** Mean per-rep form score (0–100), or null when nothing was measured. */
  avgFormScore: number | null;
  /** Best range-of-motion (degrees) reached, or null when nothing was measured. */
  maxRangeOfMotionDeg: number | null;
}

function normaliseExercise(ex: SequencerExercise): SequencerExercise {
  return {
    exerciseId: ex.exerciseId,
    name: ex.name,
    targetReps: Math.max(1, Math.floor(ex.targetReps)),
    sets: Math.max(1, Math.floor(ex.sets)),
    restSec: Math.max(0, ex.restSec),
  };
}

function emptyAccumulator(): ExerciseAccumulator {
  return { completedReps: 0, formSum: 0, formCount: 0, maxRom: null };
}

/**
 * Build the initial sequencer state for a list of exercises. Throws if empty —
 * callers with no dosage should not create a sequencer at all.
 */
export function createSequencerState(
  exercises: readonly SequencerExercise[],
): SequencerState {
  if (exercises.length === 0) {
    throw new Error('createSequencerState requires at least one exercise');
  }
  const normalised = exercises.map(normaliseExercise);
  return {
    exercises: normalised,
    exerciseIndex: 0,
    setIndex: 0,
    repsInSet: 0,
    phase: 'active',
    accumulators: normalised.map(emptyAccumulator),
  };
}

/** The exercise in progress, or null once the sequencer is complete. */
export function currentExercise(state: SequencerState): SequencerExercise | null {
  return state.exercises[state.exerciseIndex] ?? null;
}

/** True once every set of every exercise has finished. */
export function isSequencerComplete(state: SequencerState): boolean {
  return state.phase === 'complete';
}

/**
 * Finish the current set and advance. This is the single transition shared by
 * both auto-complete (reaching target reps) and the manual Next/Complete-set
 * override, so the resulting state — and therefore the recorded data — is
 * identical regardless of how the set ended.
 */
function completeCurrentSet(state: SequencerState): SequencerState {
  if (state.phase === 'complete') return state;
  const ex = state.exercises[state.exerciseIndex];

  // More sets remain for this exercise → rest (if configured) then next set.
  if (state.setIndex + 1 < ex.sets) {
    return {
      ...state,
      setIndex: state.setIndex + 1,
      repsInSet: 0,
      phase: ex.restSec > 0 ? 'resting' : 'active',
    };
  }

  // Exercise finished → move to the next exercise (no rest between exercises).
  const nextExerciseIndex = state.exerciseIndex + 1;
  const done = nextExerciseIndex >= state.exercises.length;
  return {
    ...state,
    exerciseIndex: nextExerciseIndex,
    setIndex: 0,
    repsInSet: 0,
    phase: done ? 'complete' : 'active',
  };
}

function recordRep(state: SequencerState, sample: RepSample): SequencerState {
  // Reps only count while actively performing a set.
  if (state.phase !== 'active') return state;
  const ex = state.exercises[state.exerciseIndex];

  const prev = state.accumulators[state.exerciseIndex];
  const hasForm = sample.formScore != null && Number.isFinite(sample.formScore);
  const hasRom = sample.rom != null && Number.isFinite(sample.rom);
  const nextAcc: ExerciseAccumulator = {
    completedReps: prev.completedReps + 1,
    formSum: prev.formSum + (hasForm ? (sample.formScore as number) : 0),
    formCount: prev.formCount + (hasForm ? 1 : 0),
    maxRom: hasRom
      ? Math.max(prev.maxRom ?? Number.NEGATIVE_INFINITY, sample.rom as number)
      : prev.maxRom,
  };
  const accumulators = state.accumulators.map((a, i) =>
    i === state.exerciseIndex ? nextAcc : a,
  );

  const repsInSet = state.repsInSet + 1;
  const advanced: SequencerState = { ...state, repsInSet, accumulators };

  // Reaching the target auto-completes the set via the shared transition.
  return repsInSet >= ex.targetReps ? completeCurrentSet(advanced) : advanced;
}

/** Reduce one event into a new sequencer state. Always pure. */
export function advanceSequencer(
  state: SequencerState,
  event: SequencerEvent,
): SequencerState {
  switch (event.type) {
    case 'rep':
      return recordRep(state, event);
    case 'completeSet':
      return state.phase === 'active' ? completeCurrentSet(state) : state;
    case 'next':
      if (state.phase === 'active') return completeCurrentSet(state);
      if (state.phase === 'resting') return { ...state, phase: 'active' };
      return state;
    case 'endRest':
      return state.phase === 'resting' ? { ...state, phase: 'active' } : state;
    default:
      return state;
  }
}

function toResult(
  exercise: SequencerExercise,
  acc: ExerciseAccumulator,
): TrackedExerciseResult {
  return {
    exerciseId: exercise.exerciseId,
    completedReps: acc.completedReps,
    avgFormScore: acc.formCount > 0 ? acc.formSum / acc.formCount : null,
    maxRangeOfMotionDeg: acc.maxRom,
  };
}

/**
 * The tracked result for a single exercise, in session-schema shape. Used by the
 * player to PATCH each exercise as it completes.
 */
export function exerciseResultAt(
  state: SequencerState,
  index: number,
): TrackedExerciseResult | null {
  const exercise = state.exercises[index];
  const acc = state.accumulators[index];
  if (!exercise || !acc) return null;
  return toResult(exercise, acc);
}

/** All per-exercise tracked results, index-aligned with the exercise list. */
export function exerciseResults(state: SequencerState): TrackedExerciseResult[] {
  return state.exercises.map((ex, i) => toResult(ex, state.accumulators[i]));
}
