import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  createExerciseSequencer,
  currentItem as selectCurrentItem,
  isComplete as selectIsComplete,
  type ExerciseSequencer,
  type SequencerItem,
  type SequencerState,
} from '../lib/exerciseSequencer';

/** Default rest-timer granularity — one tick per wall-clock second. */
const REST_TICK_MS = 1000;

export interface UseExerciseSequencerOptions {
  /**
   * Rest countdown interval in milliseconds. Defaults to 1000; tests pass a small
   * value (or drive `tick` directly) to avoid real-time waits.
   */
  restTickMs?: number;
}

/** The reactive view returned to the player: live state, actions, and selectors. */
export interface UseExerciseSequencerResult {
  /** The live, immutable sequencer state. */
  state: SequencerState;
  /** The exercise currently in focus, or null once complete. */
  item: SequencerItem | null;
  /** True once the completion screen should show. */
  complete: boolean;
  /** 1-based index of the current exercise (clamped to the exercise count). */
  exerciseNumber: number;
  /** Total exercises in the sequence. */
  exerciseCount: number;
  /** 1-based set number within the current exercise. */
  setNumber: number;
  /** Total sets for the current exercise (1 when complete). */
  setCount: number;
  /** The underlying store, exposed so other features can subscribe directly. */
  sequencer: ExerciseSequencer;
  start(): void;
  begin(): void;
  next(): void;
  previous(): void;
  skip(): void;
  skipRest(): void;
}

/**
 * React binding for the {@link createExerciseSequencer} store.
 *
 * It creates one sequencer per (stable) exercise list, subscribes the component
 * to it via `useSyncExternalStore`, and — while resting — drives the rest
 * countdown by ticking the store once per {@link UseExerciseSequencerOptions.restTickMs}.
 * The store instance is returned too, so tracking/session-recording can subscribe
 * to the very same source of truth.
 */
export function useExerciseSequencer(
  items: readonly SequencerItem[],
  options: UseExerciseSequencerOptions = {},
): UseExerciseSequencerResult {
  const { restTickMs = REST_TICK_MS } = options;

  // One store per exercise list. `items` is expected to be stable (memoised by
  // the caller); a new list intentionally starts a fresh sequence.
  const sequencer = useMemo(() => createExerciseSequencer(items), [items]);

  const state = useSyncExternalStore(sequencer.subscribe, sequencer.getState);

  // Keep the store in a ref so the timer effect never re-subscribes on tick.
  const sequencerRef = useRef(sequencer);
  sequencerRef.current = sequencer;

  // Drive the rest countdown only while actually resting. One stable interval per
  // rest interval ticks the store once per `restTickMs`; the store flips the phase
  // back to `active` at zero, which clears `resting` and tears the interval down.
  const resting = state.phase === 'rest';
  useEffect(() => {
    if (!resting || restTickMs <= 0) return undefined;
    const id = setInterval(() => sequencerRef.current.tick(1), restTickMs);
    return () => clearInterval(id);
  }, [resting, restTickMs]);

  return {
    state,
    item: selectCurrentItem(state),
    complete: selectIsComplete(state),
    exerciseNumber: Math.min(state.exerciseIndex + 1, state.items.length),
    exerciseCount: state.items.length,
    setNumber: state.setIndex + 1,
    setCount: selectCurrentItem(state)?.sets ?? 1,
    sequencer,
    start: sequencer.start,
    begin: sequencer.begin,
    next: sequencer.next,
    previous: sequencer.previous,
    skip: sequencer.skip,
    skipRest: sequencer.skipRest,
  };
}
