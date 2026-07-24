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
   * Category the exercise belongs to (e.g. "knee", "shoulder"). Used to group
   * and filter the library in the add-exercise picker and rendered as a tag.
   */
  category?: string;
  /** URL of a small preview image shown alongside the exercise in the picker. */
  thumbnailUrl?: string;
  /**
   * Rep-counter tracking config. Present for exercises that support automatic
   * pose-driven rep counting / hold timing; absent for demo-only entries.
   */
  tracking?: ExerciseTracking;
}
