/**
 * The three landmarks whose interior angle (measured at `vertex`) the rep
 * counter tracks for an exercise — e.g. shoulder→elbow→wrist for a bicep curl.
 *
 * Indices refer to the pose model's landmark array (MediaPipe Pose 33-point by
 * default). The measured angle is the angle of the arms `from→vertex` and
 * `to→vertex`, always in the range [0, 180] degrees.
 */
export interface AngleJoint {
  /** Landmark index of the first arm endpoint. */
  from: number;
  /** Landmark index of the vertex — the joint the angle is measured at. */
  vertex: number;
  /** Landmark index of the second arm endpoint. */
  to: number;
}

/**
 * Per-exercise tracking configuration consumed by the rep counter. Stored on
 * the exercise so the same catalogue entry drives both the demo and monitoring.
 *
 * Rep-type exercises count a rep on each full down→up cycle across the two
 * thresholds; the gap between `repDownAngle` and `repUpAngle` is the hysteresis
 * dead-band that prevents jitter near a single threshold from double counting.
 *
 * When `holdAngle` is present the exercise is a **hold** (isometric): instead of
 * counting reps it accumulates the seconds the joint is sustained past the hold
 * threshold.
 */
export interface ExerciseTracking {
  /**
   * Pose landmark indices this exercise depends on (MediaPipe Pose 33-point).
   * Includes the three `angleJoint` points and may list extra landmarks the
   * tracker needs to keep visible for a reliable measurement. Every catalogued
   * library exercise ships a non-empty list (enforced by the data-integrity
   * test); optional on the type only so ad-hoc/legacy configs can omit it.
   */
  landmarks?: number[];
  /** Which joint's angle to measure from the landmark stream. */
  angleJoint: AngleJoint;
  /** Angle (deg) marking the fully-extended/"up" end of the movement. */
  repUpAngle: number;
  /** Angle (deg) marking the fully-flexed/"down" end of the movement. */
  repDownAngle: number;
  /**
   * Hold-type only: the target angle to sustain. Presence of this field marks
   * the exercise as a hold — seconds are accumulated instead of reps counted.
   */
  holdAngle?: number;
  /**
   * Hold-type only: whether the hold is achieved below (flexed) or above
   * (extended) `holdAngle`. Defaults to `below`.
   */
  holdDirection?: 'below' | 'above';
  /**
   * Minimum landmark confidence (0–1) required to trust a frame. Frames below
   * this pause tracking rather than emitting misleading counts. Default 0.5.
   */
  minConfidence?: number;
  /**
   * Moving-average window (frames) applied to the raw angle to damp jitter.
   * Default 5; values < 1 disable smoothing.
   */
  smoothingWindow?: number;
}

/**
 * The coarse body-region buckets the seeded exercise library is grouped by.
 * Used for the `?category=` filter on `GET /api/exercises` and the picker tags.
 */
export type ExerciseCategory = 'upper' | 'lower' | 'core' | 'mobility';

/** All valid {@link ExerciseCategory} values, in display order. */
export const EXERCISE_CATEGORIES: readonly ExerciseCategory[] = [
  'upper',
  'lower',
  'core',
  'mobility',
];

/** A rehabilitation exercise and the metadata needed to render its 3D demo. */
export interface Exercise {
  id: string;
  name: string;
  /** Short human-readable description shown in player chrome (not in embed). */
  description?: string;
  /** Identifier/URL of the demo animation clip driving the looping 3D scene. */
  demoClip?: string;
  /** Accent colour (hex) used by the demo scene, e.g. "#4f46e5". */
  accentColor?: string;
  /**
   * Category the exercise belongs to. Seeded library records use the
   * {@link ExerciseCategory} vocabulary (upper/lower/core/mobility); the field
   * stays a broad `string` so ad-hoc entries and the picker can pass any tag.
   * Used to group and filter the library and rendered as a tag.
   */
  category?: string;
  /**
   * Human-readable joints the movement targets (e.g. `["hip", "knee"]`). Drives
   * grouping and helps the doctor understand what a movement trains.
   */
  targetJoints?: string[];
  /** Default number of sets prescribed when adding this exercise to a plan. */
  defaultSets?: number;
  /** Default reps-per-set prescribed when adding this exercise to a plan. */
  defaultReps?: number;
  /**
   * Default per-rep hold (seconds) prescribed for this exercise; `0` for
   * pure rep-counted movements, `> 0` for holds/isometrics.
   */
  defaultHoldSeconds?: number;
  /** URL of a small preview image shown alongside the exercise in the picker. */
  thumbnailUrl?: string;
  /**
   * Reference to the exercise's demo media clip (id or URL). Joined into template
   * previews so the client can render media without a second lookup; also used as
   * a thumbnail fallback when no dedicated `thumbnailUrl` is set.
   */
  demoMediaRef?: string;
  /**
   * Rep-counter tracking config. Present for exercises that support automatic
   * pose-driven rep counting / hold timing; absent for demo-only entries.
   */
  tracking?: ExerciseTracking;
}
