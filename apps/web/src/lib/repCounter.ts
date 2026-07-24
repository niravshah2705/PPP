/**
 * Joint-angle rep counter + stage detection (NIR-771).
 *
 * The core monitoring primitive: given a stream of pose landmark frames and an
 * exercise's {@link ExerciseTracking} config, it derives the configured joint
 * angle, smooths it, tracks up/down stages with hysteresis, and counts a rep on
 * every full down→up cycle. Hold-type exercises accumulate sustained seconds
 * past a target angle instead of counting reps.
 *
 * Design goals mirrored from `sessionSequencer`:
 * - **Pure & deterministic.** No React, no I/O, no `Date.now`. The same landmark
 *   sequence always yields the same reps/holds, so it is exhaustively unit
 *   testable from recorded fixtures. {@link observeFrame} reduces `(state,
 *   frame) → { state, events }`; {@link RepCounter} is a thin stateful wrapper
 *   over it for ergonomic real-time use with `repCompleted` listeners.
 * - **Jitter-resistant.** A moving average smooths the angle, and the dead-band
 *   between `repDownAngle` and `repUpAngle` provides hysteresis so noise near a
 *   single threshold cannot bounce the stage.
 * - **Honest under uncertainty.** Frames whose landmark confidence is below the
 *   configured floor pause tracking (no angle/stage/hold mutation) instead of
 *   emitting misleading counts, and tracking resumes cleanly when confidence
 *   returns.
 */

import type { AngleJoint, ExerciseTracking } from '../types/exercise';
import type { Exercise } from '../types/exercise';

/** Default moving-average window (frames) when the config omits one. */
export const DEFAULT_SMOOTHING_WINDOW = 5;
/** Default minimum landmark confidence (0–1) when the config omits one. */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

/** One landmark point (image-normalised coords) with a detection confidence. */
export interface Landmark {
  x: number;
  y: number;
  /** Optional depth; treated as 0 when absent. */
  z?: number;
  /** Detection confidence / visibility in [0, 1]; treated as 1 when absent. */
  confidence?: number;
}

/** One frame of the pose landmark stream. */
export interface LandmarkFrame {
  /** Landmarks indexed per the pose model (e.g. MediaPipe Pose 33-point). */
  landmarks: readonly Landmark[];
  /**
   * Monotonic timestamp in milliseconds. Required for hold-second accumulation;
   * rep counting works without it.
   */
  timestamp?: number;
}

/** Which side of the movement the joint is on. `null` before the first read. */
export type Stage = 'up' | 'down' | null;

/**
 * Events surfaced as frames are observed. `repCompleted` is the headline signal
 * downstream consumers (sequencer, overlay) react to.
 */
export type RepCounterEvent =
  | {
      type: 'repCompleted';
      /** 1-based rep number within the current run. */
      rep: number;
      /** Range of motion (deg) achieved during this rep: max − min angle. */
      rangeOfMotionDeg: number;
      /** Smallest smoothed angle reached during the rep. */
      minAngle: number;
      /** Largest smoothed angle reached during the rep. */
      maxAngle: number;
      /** Frame timestamp when the rep completed, or null when untimed. */
      timestamp: number | null;
    }
  | { type: 'stageChanged'; stage: Exclude<Stage, null>; timestamp: number | null }
  | { type: 'holdProgress'; holdSeconds: number; timestamp: number | null }
  | { type: 'paused'; timestamp: number | null }
  | { type: 'resumed'; timestamp: number | null };

/** Normalised, fully-defaulted tracking config the reducer operates on. */
export interface NormalisedTracking {
  readonly angleJoint: AngleJoint;
  readonly repUpAngle: number;
  readonly repDownAngle: number;
  readonly isHold: boolean;
  readonly holdAngle: number;
  readonly holdDirection: 'below' | 'above';
  readonly minConfidence: number;
  readonly smoothingWindow: number;
  /** True when extension ("up") is the larger angle (repUpAngle ≥ repDownAngle). */
  readonly extensionIsUp: boolean;
}

/** Immutable rep-counter state. Never mutate — always reduce via {@link observeFrame}. */
export interface RepCounterState {
  readonly config: NormalisedTracking;
  readonly stage: Stage;
  /** Reps completed so far (rep-type only). */
  readonly reps: number;
  /** Accumulated hold seconds (hold-type only). */
  readonly holdSeconds: number;
  /** Latest smoothed angle, or null before the first confident frame. */
  readonly smoothedAngle: number | null;
  /** True while tracking is live; false while paused on low confidence. */
  readonly active: boolean;
  /** Moving-average ring buffer of recent raw angles (confident frames only). */
  readonly window: readonly number[];
  /** Min/max smoothed angle within the in-progress rep (for ROM). */
  readonly repMinAngle: number | null;
  readonly repMaxAngle: number | null;
  /** Timestamp of the last confident frame (null while paused / untimed). */
  readonly lastTimestamp: number | null;
}

/** Result of observing one frame: the next state plus any emitted events. */
export interface ObserveResult {
  state: RepCounterState;
  events: RepCounterEvent[];
}

function firstDefined(...vals: Array<number | undefined>): number | undefined {
  for (const v of vals) if (v !== undefined) return v;
  return undefined;
}

/** Fully default + validate a raw tracking config. */
export function normaliseTracking(t: ExerciseTracking): NormalisedTracking {
  const repUpAngle = t.repUpAngle;
  const repDownAngle = t.repDownAngle;
  const isHold = t.holdAngle !== undefined && t.holdAngle !== null;
  const smoothing = firstDefined(t.smoothingWindow, DEFAULT_SMOOTHING_WINDOW)!;
  const minConf = firstDefined(t.minConfidence, DEFAULT_MIN_CONFIDENCE)!;
  return {
    angleJoint: t.angleJoint,
    repUpAngle,
    repDownAngle,
    isHold,
    holdAngle: t.holdAngle ?? 0,
    holdDirection: t.holdDirection ?? 'below',
    minConfidence: Math.min(1, Math.max(0, minConf)),
    // A window < 1 disables smoothing (window of 1 == raw angle).
    smoothingWindow: Math.max(1, Math.floor(smoothing)),
    extensionIsUp: repUpAngle >= repDownAngle,
  };
}

/**
 * Interior angle (degrees, [0, 180]) at `joint.vertex` between the arms to
 * `joint.from` and `joint.to`. Returns `NaN` when a landmark is missing or an
 * arm has zero length (degenerate — treated as low-signal by the reducer).
 */
export function computeJointAngle(
  landmarks: readonly Landmark[],
  joint: AngleJoint,
): number {
  const a = landmarks[joint.from];
  const b = landmarks[joint.vertex];
  const c = landmarks[joint.to];
  if (!a || !b || !c) return NaN;

  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const crossX = v1.y * v2.z - v1.z * v2.y;
  const crossY = v1.z * v2.x - v1.x * v2.z;
  const crossZ = v1.x * v2.y - v1.y * v2.x;
  const crossMag = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);

  // atan2(|v1×v2|, v1·v2) is numerically robust across the full [0, 180] range.
  const rad = Math.atan2(crossMag, dot);
  if (!Number.isFinite(rad)) return NaN;
  return (rad * 180) / Math.PI;
}

/** Confidence of the frame for this joint = min of the three relevant landmarks. */
function jointConfidence(landmarks: readonly Landmark[], joint: AngleJoint): number {
  const idxs = [joint.from, joint.vertex, joint.to];
  let min = 1;
  for (const i of idxs) {
    const lm = landmarks[i];
    if (!lm) return 0;
    const c = lm.confidence ?? 1;
    if (c < min) min = c;
  }
  return min;
}

/** Which stage region a smoothed angle falls in, or null in the dead-band. */
function regionOf(angle: number, cfg: NormalisedTracking): Stage {
  if (cfg.extensionIsUp) {
    if (angle >= cfg.repUpAngle) return 'up';
    if (angle <= cfg.repDownAngle) return 'down';
  } else {
    if (angle <= cfg.repUpAngle) return 'up';
    if (angle >= cfg.repDownAngle) return 'down';
  }
  return null;
}

/** Whether a smoothed angle satisfies a hold's target condition. */
function isHeld(angle: number, cfg: NormalisedTracking): boolean {
  return cfg.holdDirection === 'below'
    ? angle <= cfg.holdAngle
    : angle >= cfg.holdAngle;
}

function mean(xs: readonly number[]): number {
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Create the initial rep-counter state for a tracking config. */
export function createRepCounter(tracking: ExerciseTracking): RepCounterState {
  return {
    config: normaliseTracking(tracking),
    stage: null,
    reps: 0,
    holdSeconds: 0,
    smoothedAngle: null,
    active: true,
    window: [],
    repMinAngle: null,
    repMaxAngle: null,
    lastTimestamp: null,
  };
}

/**
 * Reduce one landmark frame into the next state, returning any emitted events.
 * Pure: identical `(state, frame)` inputs always produce identical outputs.
 */
export function observeFrame(state: RepCounterState, frame: LandmarkFrame): ObserveResult {
  const cfg = state.config;
  const ts = frame.timestamp ?? null;
  const events: RepCounterEvent[] = [];

  const angle = computeJointAngle(frame.landmarks, cfg.angleJoint);
  const confidence = jointConfidence(frame.landmarks, cfg.angleJoint);
  const usable = Number.isFinite(angle) && confidence >= cfg.minConfidence;

  // --- Low-confidence / degenerate frame: pause without mutating tracking. ----
  if (!usable) {
    if (state.active) events.push({ type: 'paused', timestamp: ts });
    return {
      // Drop lastTimestamp so a paused gap is never counted toward a hold; keep
      // the smoothing window and stage so tracking resumes without a false flip.
      state: { ...state, active: false, lastTimestamp: null },
      events,
    };
  }

  const wasActive = state.active;
  if (!wasActive) events.push({ type: 'resumed', timestamp: ts });

  // Moving-average smoothing over the most recent raw angles.
  const window = [...state.window, angle].slice(-cfg.smoothingWindow);
  const smoothed = mean(window);

  // --- Hold-type: accumulate sustained seconds instead of counting reps. ------
  if (cfg.isHold) {
    let holdSeconds = state.holdSeconds;
    if (
      isHeld(smoothed, cfg) &&
      state.lastTimestamp !== null &&
      ts !== null &&
      ts > state.lastTimestamp
    ) {
      holdSeconds += (ts - state.lastTimestamp) / 1000;
      events.push({ type: 'holdProgress', holdSeconds, timestamp: ts });
    }
    return {
      state: {
        ...state,
        active: true,
        window,
        smoothedAngle: smoothed,
        holdSeconds,
        lastTimestamp: ts ?? state.lastTimestamp,
      },
      events,
    };
  }

  // --- Rep-type: hysteretic stage detection + rep counting. -------------------
  const region = regionOf(smoothed, cfg);
  const newStage: Stage = region ?? state.stage;

  let repMin = state.repMinAngle === null ? smoothed : Math.min(state.repMinAngle, smoothed);
  let repMax = state.repMaxAngle === null ? smoothed : Math.max(state.repMaxAngle, smoothed);
  let reps = state.reps;

  if (newStage !== state.stage) {
    // A partial move that never crosses a threshold stays in the dead-band and
    // never reaches this branch, so it is never counted.
    if (newStage !== null) {
      events.push({ type: 'stageChanged', stage: newStage, timestamp: ts });
    }
    // A completed rep is a full return to "up" after having been "down".
    if (newStage === 'up' && state.stage === 'down') {
      reps += 1;
      events.push({
        type: 'repCompleted',
        rep: reps,
        rangeOfMotionDeg: repMax - repMin,
        minAngle: repMin,
        maxAngle: repMax,
        timestamp: ts,
      });
      // Reset ROM accumulators for the next rep from the current position.
      repMin = smoothed;
      repMax = smoothed;
    }
  }

  return {
    state: {
      ...state,
      active: true,
      window,
      smoothedAngle: smoothed,
      stage: newStage,
      reps,
      repMinAngle: repMin,
      repMaxAngle: repMax,
      lastTimestamp: ts ?? state.lastTimestamp,
    },
    events,
  };
}

/** Reduce a whole sequence of frames, collecting every emitted event in order. */
export function observeSequence(
  state: RepCounterState,
  frames: Iterable<LandmarkFrame>,
): ObserveResult {
  let current = state;
  const events: RepCounterEvent[] = [];
  for (const frame of frames) {
    const result = observeFrame(current, frame);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

/** Listener invoked with each emitted event. */
export type RepCounterListener = (event: RepCounterEvent) => void;

/**
 * Thin stateful wrapper over the pure reducer for real-time use. Feed frames as
 * they arrive; subscribe to `repCompleted` (or any event) via {@link on}.
 *
 * ```ts
 * const counter = RepCounter.fromExercise(exercise);
 * counter.on('repCompleted', (e) => sequencer.completeRep({ rom: e.rangeOfMotionDeg }));
 * counter.push(frame);
 * ```
 */
export class RepCounter {
  private state: RepCounterState;
  private readonly listeners = new Set<RepCounterListener>();

  constructor(tracking: ExerciseTracking) {
    this.state = createRepCounter(tracking);
  }

  /** Build a counter from a library exercise's tracking config. */
  static fromExercise(exercise: Exercise): RepCounter {
    if (!exercise.tracking) {
      throw new Error(`Exercise "${exercise.id}" has no tracking config`);
    }
    return new RepCounter(exercise.tracking);
  }

  /** Feed one frame; returns the events it produced (also dispatched to listeners). */
  push(frame: LandmarkFrame): RepCounterEvent[] {
    const { state, events } = observeFrame(this.state, frame);
    this.state = state;
    for (const event of events) {
      for (const listener of this.listeners) listener(event);
    }
    return events;
  }

  /**
   * Subscribe to events. Pass an event `type` to filter, or omit for all.
   * Returns an unsubscribe function.
   */
  on(type: RepCounterEvent['type'] | RepCounterListener, listener?: RepCounterListener): () => void {
    const filter = typeof type === 'string' ? type : null;
    const fn = typeof type === 'string' ? listener! : type;
    const wrapped: RepCounterListener = (event) => {
      if (filter === null || event.type === filter) fn(event);
    };
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  /** Current rep count. */
  get reps(): number {
    return this.state.reps;
  }

  /** Accumulated hold seconds (hold-type exercises). */
  get holdSeconds(): number {
    return this.state.holdSeconds;
  }

  /** Current stage, or null before the first confident frame. */
  get stage(): Stage {
    return this.state.stage;
  }

  /** True while tracking is live; false while paused on low confidence. */
  get active(): boolean {
    return this.state.active;
  }

  /** Latest smoothed angle, or null before the first confident frame. */
  get smoothedAngle(): number | null {
    return this.state.smoothedAngle;
  }

  /** Immutable snapshot of the underlying state. */
  get snapshot(): RepCounterState {
    return this.state;
  }
}
