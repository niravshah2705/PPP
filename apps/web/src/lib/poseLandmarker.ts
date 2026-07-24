/**
 * MediaPipe PoseLandmarker boundary + landmark mapping (NIR-770).
 *
 * This module is the *input* side of the monitoring pipeline: it wraps
 * MediaPipe Tasks Vision's `PoseLandmarker` (WASM) into a small, neutral
 * {@link PoseDetector} interface and maps its 33-point output into the exact
 * {@link LandmarkFrame} shape the rep counter (NIR-771) consumes — so the feed
 * and the counter share one source of truth for landmark data.
 *
 * Design:
 * - The heavy MediaPipe module is loaded lazily via a dynamic `import()` so the
 *   ~700 kB WASM runtime never bloats the initial bundle and is only paid for
 *   when a patient actually starts camera tracking.
 * - Everything that can be pure *is* pure ({@link toLandmarkFrame}, the
 *   {@link POSE_CONNECTIONS} topology, the landmark count), so the mapping and
 *   overlay topology are exhaustively unit-testable without a browser or WASM.
 * - The module loader is injectable ({@link createPoseLandmarker}'s second arg)
 *   so the adapter can be exercised against a fake MediaPipe in tests.
 */

import type { Landmark, LandmarkFrame } from './repCounter';

/** Number of landmarks emitted per frame by the MediaPipe Pose model. */
export const POSE_LANDMARK_COUNT = 33;

/** Default CDN location of the MediaPipe Tasks-Vision WASM fileset. */
export const DEFAULT_WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

/** Default hosted pose-landmarker model asset (lite float16). */
export const DEFAULT_MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** A pair of landmark indices to draw as a bone in the skeleton overlay. */
export interface PoseConnection {
  readonly start: number;
  readonly end: number;
}

/**
 * The canonical MediaPipe Pose topology (35 bones over the 33 landmarks):
 * face, both arms + hands, torso, and both legs + feet. Kept as a local
 * constant so the overlay can draw the skeleton without importing (and thereby
 * eagerly loading) the MediaPipe runtime.
 */
export const POSE_CONNECTIONS: readonly PoseConnection[] = [
  // Face.
  { start: 0, end: 1 },
  { start: 1, end: 2 },
  { start: 2, end: 3 },
  { start: 3, end: 7 },
  { start: 0, end: 4 },
  { start: 4, end: 5 },
  { start: 5, end: 6 },
  { start: 6, end: 8 },
  { start: 9, end: 10 },
  // Shoulders + left arm/hand.
  { start: 11, end: 12 },
  { start: 11, end: 13 },
  { start: 13, end: 15 },
  { start: 15, end: 17 },
  { start: 15, end: 19 },
  { start: 15, end: 21 },
  { start: 17, end: 19 },
  // Right arm/hand.
  { start: 12, end: 14 },
  { start: 14, end: 16 },
  { start: 16, end: 18 },
  { start: 16, end: 20 },
  { start: 16, end: 22 },
  { start: 18, end: 20 },
  // Torso.
  { start: 11, end: 23 },
  { start: 12, end: 24 },
  { start: 23, end: 24 },
  // Left leg/foot.
  { start: 23, end: 25 },
  { start: 25, end: 27 },
  { start: 27, end: 29 },
  { start: 29, end: 31 },
  { start: 27, end: 31 },
  // Right leg/foot.
  { start: 24, end: 26 },
  { start: 26, end: 28 },
  { start: 28, end: 30 },
  { start: 30, end: 32 },
  { start: 28, end: 32 },
];

/** Minimal shape of a MediaPipe normalized landmark we read. */
export interface RawPoseLandmark {
  x: number;
  y: number;
  z?: number;
  /** Likelihood the landmark is visible, in [0, 1]. */
  visibility?: number;
}

/** Minimal shape of a MediaPipe `PoseLandmarkerResult` we read. */
export interface RawPoseResult {
  /** One landmark array per detected pose (we use the first). */
  landmarks: RawPoseLandmark[][];
}

/** Anything MediaPipe accepts as a video frame (an `HTMLVideoElement` at runtime). */
export type PoseVideoSource = HTMLVideoElement;

/**
 * Neutral detector the rAF loop depends on — decouples the loop from MediaPipe
 * so it can be driven by a fake in tests.
 */
export interface PoseDetector {
  /**
   * Run pose inference on one video frame. Returns a {@link LandmarkFrame} when
   * a pose was found, or `null` when no person is detected.
   */
  detect(video: PoseVideoSource, timestampMs: number): LandmarkFrame | null;
  /** Release the underlying WASM resources. Idempotent-safe to call on teardown. */
  close(): void;
}

/** Tunable options for {@link createPoseLandmarker}. */
export interface PoseLandmarkerConfig {
  /** WASM fileset base path (defaults to {@link DEFAULT_WASM_BASE_PATH}). */
  wasmBasePath?: string;
  /** Model asset path (defaults to {@link DEFAULT_MODEL_ASSET_PATH}). */
  modelAssetPath?: string;
  /** Number of poses to detect (defaults to 1 — the exercising patient). */
  numPoses?: number;
  /** Minimum confidence for the pose *detection* to be considered successful. */
  minPoseDetectionConfidence?: number;
  /** Minimum confidence for pose *presence* to be considered successful. */
  minPosePresenceConfidence?: number;
  /** Minimum confidence for the pose *tracking* to be considered successful. */
  minTrackingConfidence?: number;
  /** Inference delegate; `GPU` when available, else `CPU`. */
  delegate?: 'CPU' | 'GPU';
}

/** Injectable loader for the MediaPipe Tasks-Vision module (defaults to a dynamic import). */
export type VisionModuleLoader = () => Promise<typeof import('@mediapipe/tasks-vision')>;

const loadVisionModule: VisionModuleLoader = () => import('@mediapipe/tasks-vision');

/**
 * Map a MediaPipe result into the pipeline's {@link LandmarkFrame}.
 *
 * The first detected pose's landmarks are converted point-for-point, carrying
 * MediaPipe's per-landmark `visibility` through as the rep counter's
 * `confidence` (absent visibility is treated as fully confident, and absent
 * depth as 0). An empty/absent pose yields an empty landmark list so callers
 * can treat it as "no person in frame".
 */
export function toLandmarkFrame(result: RawPoseResult, timestampMs: number): LandmarkFrame {
  const pose = result.landmarks?.[0] ?? [];
  const landmarks: Landmark[] = pose.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z ?? 0,
    confidence: lm.visibility ?? 1,
  }));
  return { landmarks, timestamp: timestampMs };
}

/**
 * Create a MediaPipe-backed {@link PoseDetector} running in VIDEO mode.
 *
 * Lazily loads the Tasks-Vision runtime + WASM fileset, then builds a
 * `PoseLandmarker` configured for a single pose at real-time video rates. The
 * returned adapter maps each frame to a {@link LandmarkFrame} (or `null` when no
 * pose is present) and exposes `close()` to release the WASM resources.
 *
 * @param config  detector tuning (paths, confidences, delegate).
 * @param load    injectable module loader (defaults to the real dynamic import).
 */
export async function createPoseLandmarker(
  config: PoseLandmarkerConfig = {},
  load: VisionModuleLoader = loadVisionModule,
): Promise<PoseDetector> {
  const vision = await load();
  const fileset = await vision.FilesetResolver.forVisionTasks(
    config.wasmBasePath ?? DEFAULT_WASM_BASE_PATH,
  );
  const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: config.modelAssetPath ?? DEFAULT_MODEL_ASSET_PATH,
      delegate: config.delegate ?? 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: config.numPoses ?? 1,
    minPoseDetectionConfidence: config.minPoseDetectionConfidence ?? 0.5,
    minPosePresenceConfidence: config.minPosePresenceConfidence ?? 0.5,
    minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
  });

  return {
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      if (!result || !result.landmarks || result.landmarks.length === 0) return null;
      return toLandmarkFrame(result, timestampMs);
    },
    close() {
      landmarker.close();
    },
  };
}
