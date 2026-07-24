/**
 * Exercise sequencing engine (NIR-766).
 *
 * The patient-facing player steps through a plan's exercises in order, showing a
 * per-exercise instruction screen, then walks each set (with a rest interval
 * between sets) before advancing to the next exercise and, finally, a completion
 * screen. This module is the deterministic finite-state machine behind that flow:
 *
 *     idle ──start──▶ instruction ──begin──▶ active ──┐
 *                          ▲                           │ set done, more sets
 *                          │ previous                  ▼
 *                          │                          rest ──(timer/skip)──▶ active
 *                          │                           │
 *                     next exercise ◀── last set done ─┘
 *                          │
 *                          ▼
 *                       complete
 *
 * Design goals mirrored from the ticket:
 * - **Deterministic** — every transition is a pure reduction over the current
 *   phase, so the same event stream always yields the same state (and identical
 *   recorded results) no matter the timing.
 * - **Resilient to rapid presses** — each transition is guarded on the phase it
 *   applies to, so a double-tapped Next/Skip/Previous can never skip two steps or
 *   corrupt the set/exercise cursor.
 * - **Observable** — the {@link ExerciseSequencer} store wraps the reducer with
 *   `getState`/`subscribe`, so tracking and session-recording features can
 *   subscribe to progression later without owning the transition logic.
 *
 * The reducer ({@link reduceSequencer}) and initial-state builder are exported
 * separately from the store so the transitions can be exhaustively unit-tested
 * without any timers or React.
 */

/**
 * One exercise the sequencer walks the patient through, with the dosage and the
 * presentation metadata the instruction screen renders.
 */
export interface SequencerItem {
  /** Stable exercise id (matches the plan/exercise catalogue). */
  exerciseId: string;
  /** Human-readable name shown on the instruction/active screen. */
  name: string;
  /** Short description/instructions shown on the instruction screen. */
  description?: string;
  /** Demo media reference (id or URL) for the looping demo/thumbnail. */
  demoMediaRef?: string;
  /** Small preview image URL, when the exercise has one. */
  thumbnailUrl?: string;
  /** Number of sets to perform (coerced to at least 1). */
  sets: number;
  /** Target reps per set (coerced to at least 1). Ignored for holds. */
  targetReps: number;
  /**
   * Hold duration in seconds for an isometric exercise (coerced to >= 0). When
   * greater than zero the instruction screen shows a hold target instead of a
   * rep target.
   */
  holdSeconds: number;
  /** Rest seconds between sets (coerced to >= 0). No rest follows the last set. */
  restSeconds: number;
}

/**
 * Where the sequencer currently is:
 * - `idle`        — nothing started yet; the player shows a "begin session" cue.
 * - `instruction` — showing the current exercise's instructions before its set.
 * - `active`      — the patient is performing the current set.
 * - `rest`        — a set just finished and a rest interval is counting down.
 * - `complete`    — every set of every exercise is done (completion screen).
 */
export type SequencerPhase = 'idle' | 'instruction' | 'active' | 'rest' | 'complete';

/** How an exercise ended up in the session results. */
export type ExerciseOutcome = 'pending' | 'completed' | 'skipped';

/** Running per-exercise result, index-aligned with `SequencerState.items`. */
export interface SequencerExerciseResult {
  readonly exerciseId: string;
  /** `completed` when all sets were performed, `skipped` when Skip was pressed. */
  readonly outcome: ExerciseOutcome;
  /** Sets the patient actually finished before completing/skipping. */
  readonly completedSets: number;
}

/** Immutable snapshot of the sequencer. Never mutate — always reduce. */
export interface SequencerState {
  readonly items: readonly SequencerItem[];
  readonly phase: SequencerPhase;
  /** Index of the current exercise (== items.length when complete). */
  readonly exerciseIndex: number;
  /** 0-based set index within the current exercise. */
  readonly setIndex: number;
  /** Seconds remaining in the current rest interval (0 outside `rest`). */
  readonly restRemaining: number;
  /** Per-exercise outcomes, index-aligned with {@link items}. */
  readonly results: readonly SequencerExerciseResult[];
}

/**
 * Events the sequencer accepts.
 * - `start`    — leave `idle` and show the first exercise's instructions.
 * - `begin`    — leave the instruction screen and start the current set.
 * - `next`     — advance the flow: begin the set / complete the set / skip rest.
 * - `previous` — step back: to this exercise's instructions, or the prior one.
 * - `skip`     — record the current exercise as skipped and jump to the next.
 * - `skipRest` — end a pending rest immediately and resume the next set.
 * - `tick`     — the rest timer elapsed by `seconds` (default 1).
 */
export type SequencerEvent =
  | { type: 'start' }
  | { type: 'begin' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'skip' }
  | { type: 'skipRest' }
  | { type: 'tick'; seconds?: number };

function normaliseItem(item: SequencerItem): SequencerItem {
  return {
    exerciseId: item.exerciseId,
    name: item.name,
    description: item.description,
    demoMediaRef: item.demoMediaRef,
    thumbnailUrl: item.thumbnailUrl,
    sets: Math.max(1, Math.floor(item.sets)),
    targetReps: Math.max(1, Math.floor(item.targetReps)),
    holdSeconds: Math.max(0, Math.floor(item.holdSeconds)),
    restSeconds: Math.max(0, Math.floor(item.restSeconds)),
  };
}

function pendingResult(item: SequencerItem): SequencerExerciseResult {
  return { exerciseId: item.exerciseId, outcome: 'pending', completedSets: 0 };
}

/**
 * Build the initial (`idle`) sequencer state for a list of exercises. Throws if
 * empty — callers with nothing to sequence should not create a sequencer at all.
 */
export function createSequencerState(items: readonly SequencerItem[]): SequencerState {
  if (items.length === 0) {
    throw new Error('createSequencerState requires at least one exercise');
  }
  const normalised = items.map(normaliseItem);
  return {
    items: normalised,
    phase: 'idle',
    exerciseIndex: 0,
    setIndex: 0,
    restRemaining: 0,
    results: normalised.map(pendingResult),
  };
}

/** The exercise currently in focus, or null once complete. */
export function currentItem(state: SequencerState): SequencerItem | null {
  return state.items[state.exerciseIndex] ?? null;
}

/** True once every set of every exercise has finished (or been skipped). */
export function isComplete(state: SequencerState): boolean {
  return state.phase === 'complete';
}

/** Immutably replace the result for one exercise index. */
function withResult(
  state: SequencerState,
  index: number,
  patch: Partial<SequencerExerciseResult>,
): readonly SequencerExerciseResult[] {
  return state.results.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

/**
 * Move focus onto `nextIndex`, entering its instruction screen — or the
 * completion phase when the plan is exhausted. Shared by set-completion, Skip,
 * and Previous so "advance to an exercise" always lands in the same state.
 */
function focusExercise(state: SequencerState, nextIndex: number): SequencerState {
  if (nextIndex >= state.items.length) {
    return {
      ...state,
      phase: 'complete',
      exerciseIndex: state.items.length,
      setIndex: 0,
      restRemaining: 0,
    };
  }
  return {
    ...state,
    phase: 'instruction',
    exerciseIndex: nextIndex,
    setIndex: 0,
    restRemaining: 0,
  };
}

/**
 * Finish the current set. If more sets remain, rest (when `restSeconds > 0`) or
 * roll straight into the next set; otherwise mark the exercise completed and
 * advance to the next exercise (or the completion screen).
 */
function completeCurrentSet(state: SequencerState): SequencerState {
  const item = state.items[state.exerciseIndex];
  const finishedSets = state.setIndex + 1;

  if (finishedSets < item.sets) {
    const results = withResult(state, state.exerciseIndex, { completedSets: finishedSets });
    return {
      ...state,
      results,
      setIndex: finishedSets,
      phase: item.restSeconds > 0 ? 'rest' : 'active',
      restRemaining: item.restSeconds > 0 ? item.restSeconds : 0,
    };
  }

  // Last set done → mark completed, then advance to the next exercise.
  const results = withResult(state, state.exerciseIndex, {
    outcome: 'completed',
    completedSets: finishedSets,
  });
  return focusExercise({ ...state, results }, state.exerciseIndex + 1);
}

/** Reduce one event into a new sequencer state. Always pure. */
export function reduceSequencer(state: SequencerState, event: SequencerEvent): SequencerState {
  switch (event.type) {
    case 'start':
      return state.phase === 'idle' ? { ...state, phase: 'instruction' } : state;

    case 'begin':
      return state.phase === 'instruction' ? { ...state, phase: 'active' } : state;

    case 'next':
      // Forward flow depends on where we are, but never skips two steps.
      if (state.phase === 'idle') return { ...state, phase: 'instruction' };
      if (state.phase === 'instruction') return { ...state, phase: 'active' };
      if (state.phase === 'active') return completeCurrentSet(state);
      if (state.phase === 'rest') return { ...state, phase: 'active', restRemaining: 0 };
      return state;

    case 'previous':
      // From an in-progress set/rest, step back to this exercise's instructions.
      if (state.phase === 'active' || state.phase === 'rest') {
        return {
          ...state,
          phase: 'instruction',
          setIndex: 0,
          restRemaining: 0,
          results: withResult(state, state.exerciseIndex, {
            outcome: 'pending',
            completedSets: 0,
          }),
        };
      }
      // From an instruction screen, go to the previous exercise's instructions.
      if (state.phase === 'instruction' && state.exerciseIndex > 0) {
        const target = state.exerciseIndex - 1;
        return {
          ...state,
          phase: 'instruction',
          exerciseIndex: target,
          setIndex: 0,
          restRemaining: 0,
          results: withResult(state, target, { outcome: 'pending', completedSets: 0 }),
        };
      }
      return state;

    case 'skip':
      // Record the current exercise as skipped and jump to the next one.
      if (state.phase === 'instruction' || state.phase === 'active' || state.phase === 'rest') {
        const results = withResult(state, state.exerciseIndex, { outcome: 'skipped' });
        return focusExercise({ ...state, results }, state.exerciseIndex + 1);
      }
      return state;

    case 'skipRest':
      return state.phase === 'rest' ? { ...state, phase: 'active', restRemaining: 0 } : state;

    case 'tick': {
      if (state.phase !== 'rest') return state;
      const step = Math.max(0, event.seconds ?? 1);
      const remaining = Math.max(0, state.restRemaining - step);
      // Rest elapsed → resume the next set.
      if (remaining <= 0) return { ...state, phase: 'active', restRemaining: 0 };
      return { ...state, restRemaining: remaining };
    }

    default:
      return state;
  }
}

/** A subscriber notified with the latest immutable state after every change. */
export type SequencerListener = (state: SequencerState) => void;

/**
 * Observable sequencer store: an ergonomic action API around
 * {@link reduceSequencer} plus `getState`/`subscribe`.
 *
 * Subscribers are notified only when a dispatched event actually changes the
 * state (reference inequality), so no-op guarded transitions — the common result
 * of a rapid double-press — never fire spurious notifications.
 */
export interface ExerciseSequencer {
  getState(): SequencerState;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: SequencerListener): () => void;
  /** Dispatch a raw event (all action helpers funnel through this). */
  dispatch(event: SequencerEvent): SequencerState;
  start(): void;
  begin(): void;
  next(): void;
  previous(): void;
  skip(): void;
  skipRest(): void;
  /** Advance the rest timer by `seconds` (default 1). */
  tick(seconds?: number): void;
}

/**
 * Create an observable sequencer for a list of exercises. Throws when the list
 * is empty (see {@link createSequencerState}).
 */
export function createExerciseSequencer(items: readonly SequencerItem[]): ExerciseSequencer {
  let state = createSequencerState(items);
  const listeners = new Set<SequencerListener>();

  const dispatch = (event: SequencerEvent): SequencerState => {
    const next = reduceSequencer(state, event);
    if (next !== state) {
      state = next;
      listeners.forEach((listener) => listener(state));
    }
    return state;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch,
    start: () => void dispatch({ type: 'start' }),
    begin: () => void dispatch({ type: 'begin' }),
    next: () => void dispatch({ type: 'next' }),
    previous: () => void dispatch({ type: 'previous' }),
    skip: () => void dispatch({ type: 'skip' }),
    skipRest: () => void dispatch({ type: 'skipRest' }),
    tick: (seconds) => void dispatch({ type: 'tick', seconds }),
  };
}
