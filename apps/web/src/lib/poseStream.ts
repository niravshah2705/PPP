/**
 * Pose-feed gating: detection-state machine + frame throttle (NIR-770).
 *
 * The MediaPipe detector emits a raw {@link LandmarkFrame} (or `null`) per
 * inference; this pure layer decides — honestly, and without flicker — whether
 * those landmarks are trustworthy enough to (a) forward to downstream modules
 * and (b) draw as a live skeleton, or whether the patient should instead be
 * nudged to "get in frame".
 *
 * Mirrors the rep counter's "honest under uncertainty" stance: low-light /
 * no-person frames whose mean landmark confidence is below the floor are NOT
 * emitted — a `position yourself in frame` hint is surfaced instead of leaking
 * unreliable landmarks. A short debounce on both edges stops a single noisy
 * frame from toggling the overlay.
 *
 * Everything here is pure and deterministic: the same frame sequence always
 * yields the same detection transitions and emissions, so it is exhaustively
 * unit-testable from synthetic frames.
 */

import type { LandmarkFrame } from './repCounter';

/** Default minimum mean landmark confidence (0–1) to treat a frame as reliable. */
export const DEFAULT_MIN_LANDMARK_CONFIDENCE = 0.5;
/** Default target inference rate — within the ticket's 15–30 fps window. */
export const DEFAULT_TARGET_FPS = 24;
/** Default consecutive frames required to flip detection state (anti-flicker). */
export const DEFAULT_DEBOUNCE_FRAMES = 3;

/**
 * Whether a usable pose is being tracked.
 *
 * - `searching` — no reliable pose yet (no person / low light / low confidence);
 *   the UI shows the "get in frame" hint and nothing is emitted downstream.
 * - `tracking`  — a reliable pose is present; confident frames are emitted.
 */
export type PoseDetectionState = 'searching' | 'tracking';

/** Fully-defaulted gating config the reducer operates on. */
export interface PoseStreamConfig {
  readonly minConfidence: number;
  readonly debounceFrames: number;
}

/** Immutable pose-stream state. Never mutate — reduce via {@link observePoseFrame}. */
export interface PoseStreamState {
  readonly detection: PoseDetectionState;
  /** Mean landmark confidence of the most recent frame (0 when no pose). */
  readonly confidence: number;
  /** Consecutive reliable frames seen (used to promote to `tracking`). */
  readonly confidentStreak: number;
  /** Consecutive unreliable frames seen (used to demote to `searching`). */
  readonly unconfidentStreak: number;
}

/** Result of observing one frame: next state + what the UI/consumers should do. */
export interface PoseStreamResult {
  readonly state: PoseStreamState;
  /** The detection state *after* this frame. */
  readonly detection: PoseDetectionState;
  /**
   * The frame to forward to downstream subscribers, or `null` when the frame is
   * unreliable (so bad data is never emitted).
   */
  readonly emit: LandmarkFrame | null;
  /** True when the patient should reposition (i.e. we are `searching`). */
  readonly hint: boolean;
}

/** Fill defaults for a partial gating config. */
export function normalisePoseStreamConfig(
  config: Partial<PoseStreamConfig> = {},
): PoseStreamConfig {
  const minConfidence = config.minConfidence ?? DEFAULT_MIN_LANDMARK_CONFIDENCE;
  const debounce = config.debounceFrames ?? DEFAULT_DEBOUNCE_FRAMES;
  return {
    minConfidence: Math.min(1, Math.max(0, minConfidence)),
    debounceFrames: Math.max(1, Math.floor(debounce)),
  };
}

/** The initial pose-stream state (starts `searching` until a pose is confirmed). */
export function createPoseStreamState(): PoseStreamState {
  return { detection: 'searching', confidence: 0, confidentStreak: 0, unconfidentStreak: 0 };
}

/**
 * Mean landmark confidence for a frame (0 when the frame is `null` or empty).
 * A missing per-landmark `confidence` is treated as fully confident (1).
 */
export function frameConfidence(frame: LandmarkFrame | null): number {
  if (!frame || frame.landmarks.length === 0) return 0;
  let sum = 0;
  for (const lm of frame.landmarks) sum += lm.confidence ?? 1;
  return sum / frame.landmarks.length;
}

/**
 * Reduce one detector frame into the next {@link PoseStreamState}, deciding the
 * detection state, what to emit downstream, and whether to show the hint.
 *
 * A reliable frame (non-empty, mean confidence ≥ floor) advances the confident
 * streak and resets the unconfident one; after `debounceFrames` reliable frames
 * detection promotes to `tracking`. Symmetrically, `debounceFrames` unreliable
 * frames demote it to `searching`. Frames are emitted downstream ONLY while
 * `tracking` AND the current frame is itself reliable — so neither a warm-up
 * frame nor a brief dropout leaks unreliable landmarks.
 */
export function observePoseFrame(
  state: PoseStreamState,
  frame: LandmarkFrame | null,
  config: Partial<PoseStreamConfig> = {},
): PoseStreamResult {
  const cfg = normalisePoseStreamConfig(config);
  const confidence = frameConfidence(frame);
  const reliable = frame !== null && frame.landmarks.length > 0 && confidence >= cfg.minConfidence;

  const confidentStreak = reliable ? state.confidentStreak + 1 : 0;
  const unconfidentStreak = reliable ? 0 : state.unconfidentStreak + 1;

  let detection = state.detection;
  if (detection === 'searching' && confidentStreak >= cfg.debounceFrames) {
    detection = 'tracking';
  } else if (detection === 'tracking' && unconfidentStreak >= cfg.debounceFrames) {
    detection = 'searching';
  }

  const emit = detection === 'tracking' && reliable ? frame : null;

  return {
    state: { detection, confidence, confidentStreak, unconfidentStreak },
    detection,
    emit,
    hint: detection === 'searching',
  };
}

/**
 * Throttle decision for the rAF loop: whether enough time has passed since the
 * last inference to run another at `targetFps`. Running inference every animation
 * frame (~60 fps) is wasteful and drops frames; this caps it to the target rate.
 */
export function shouldSample(
  lastSampleMs: number | null,
  nowMs: number,
  targetFps: number = DEFAULT_TARGET_FPS,
): boolean {
  if (lastSampleMs === null) return true;
  const minInterval = 1000 / Math.max(1, targetFps);
  return nowMs - lastSampleMs >= minInterval;
}
