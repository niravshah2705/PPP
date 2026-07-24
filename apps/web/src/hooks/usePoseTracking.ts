import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { LandmarkFrame } from '../lib/repCounter';
import {
  createPoseLandmarker,
  type PoseDetector,
  type PoseLandmarkerConfig,
} from '../lib/poseLandmarker';
import {
  createPoseStreamState,
  observePoseFrame,
  shouldSample,
  type PoseDetectionState,
  DEFAULT_MIN_LANDMARK_CONFIDENCE,
  DEFAULT_TARGET_FPS,
} from '../lib/poseStream';
import { clearOverlay, drawSkeleton } from '../lib/skeletonOverlay';

/**
 * Lifecycle status of the pose feed.
 *
 * - `idle`     — inactive (no stream, or tracking disabled).
 * - `loading`  — the MediaPipe WASM runtime/model is initialising.
 * - `tracking` — a reliable pose is being tracked and drawn.
 * - `searching`— running, but no reliable pose (show the "get in frame" hint).
 * - `error`    — the detector failed to initialise (feed degrades silently).
 */
export type PoseTrackingStatus = 'idle' | 'loading' | 'tracking' | 'searching' | 'error';

export interface UsePoseTrackingOptions {
  /** The already-granted camera stream to run inference on (owner stops it). */
  stream: MediaStream | null;
  /** Whether the feed should be running (false tears the loop/detector down). */
  active: boolean;
  /** Target inference rate in fps (throttled; defaults to ~24). */
  targetFps?: number;
  /** Minimum mean landmark confidence to treat a frame as reliable. */
  minConfidence?: number;
  /** Mirror the skeleton to match a selfie-view video (default true). */
  mirror?: boolean;
  /** Called with each reliable frame — the downstream landmark subscription. */
  onLandmarks?: (frame: LandmarkFrame) => void;
  /** Injectable detector factory (tests / custom config). */
  createDetector?: (config?: PoseLandmarkerConfig) => Promise<PoseDetector>;
  /** Detector tuning passed to the factory. */
  detectorConfig?: PoseLandmarkerConfig;
}

export interface UsePoseTrackingResult {
  /** Attach to the `<video>` element that renders the camera stream. */
  videoRef: RefObject<HTMLVideoElement>;
  /** Attach to the `<canvas>` element that renders the skeleton overlay. */
  canvasRef: RefObject<HTMLCanvasElement>;
  status: PoseTrackingStatus;
  detection: PoseDetectionState;
}

/** A monotonic clock; falls back to Date.now when performance is unavailable. */
function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Drive MediaPipe pose inference over a camera stream, emitting landmarks and
 * painting a live skeleton overlay (NIR-770).
 *
 * Camera *permission* is owned upstream (`requestCamera` / `useExerciseTracking`);
 * this hook consumes the already-granted `stream`. When `active`, it attaches the
 * stream to the video element, lazily creates a {@link PoseDetector}, and runs a
 * throttled `requestAnimationFrame` loop at ~`targetFps`. Each inference is gated
 * through {@link observePoseFrame} so only reliable frames are drawn and handed to
 * `onLandmarks`; unreliable frames flip the feed to `searching` (the caller shows
 * a "get in frame" hint) instead of emitting bad data.
 *
 * Teardown is thorough: flipping `active` off, swapping the stream, or unmounting
 * cancels the loop, closes the detector (releasing WASM), and detaches the video
 * — so leaving an exercise never leaks a runaway inference loop. The stream's own
 * tracks are left to their owner to stop.
 */
export function usePoseTracking(options: UsePoseTrackingOptions): UsePoseTrackingResult {
  const {
    stream,
    active,
    targetFps = DEFAULT_TARGET_FPS,
    minConfidence = DEFAULT_MIN_LANDMARK_CONFIDENCE,
    mirror = true,
    onLandmarks,
    createDetector = createPoseLandmarker,
    detectorConfig,
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<PoseTrackingStatus>('idle');
  const [detection, setDetection] = useState<PoseDetectionState>('searching');

  // Keep volatile callbacks/tuning in refs so the effect need not restart (and
  // re-init the WASM runtime) on every parent render.
  const onLandmarksRef = useRef(onLandmarks);
  onLandmarksRef.current = onLandmarks;
  const targetFpsRef = useRef(targetFps);
  targetFpsRef.current = targetFps;
  const minConfidenceRef = useRef(minConfidence);
  minConfidenceRef.current = minConfidence;
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;

  useEffect(() => {
    if (!active || !stream) {
      setStatus('idle');
      setDetection('searching');
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let detector: PoseDetector | null = null;
    let lastSample: number | null = null;
    let streamState = createPoseStreamState();

    const video = videoRef.current;
    if (video) {
      try {
        video.srcObject = stream;
      } catch {
        /* jsdom / unsupported: ignore, the loop simply won't have frames */
      }
      video.muted = true;
      video.playsInline = true;
      try {
        const played = video.play?.();
        // Autoplay may be deferred; the loop tolerates a not-yet-playing video.
        if (played && typeof played.then === 'function') played.catch(() => {});
      } catch {
        /* play() unsupported (e.g. jsdom) — ignore */
      }
    }

    const stop = () => {
      cancelled = true;
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
      detector?.close();
      detector = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) clearOverlay(ctx, canvas.width, canvas.height);
      const v = videoRef.current;
      if (v) {
        try {
          v.srcObject = null;
        } catch {
          /* ignore */
        }
      }
    };

    const tick = () => {
      if (cancelled) return;
      rafId =
        typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : null;

      const current = now();
      if (!shouldSample(lastSample, current, targetFpsRef.current)) return;
      lastSample = current;

      const v = videoRef.current;
      const det = detector;
      // HAVE_CURRENT_DATA (2) — enough data to run inference on.
      if (!v || !det || (typeof v.readyState === 'number' && v.readyState < 2)) return;

      let frame: LandmarkFrame | null = null;
      try {
        frame = det.detect(v, current);
      } catch {
        return; // A transient inference error must not kill the loop.
      }

      const result = observePoseFrame(streamState, frame, {
        minConfidence: minConfidenceRef.current,
      });
      streamState = result.state;
      if (cancelled) return;

      setDetection(result.detection);
      setStatus(result.detection === 'tracking' ? 'tracking' : 'searching');

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        if (v.videoWidth && v.videoHeight) {
          if (canvas.width !== v.videoWidth) canvas.width = v.videoWidth;
          if (canvas.height !== v.videoHeight) canvas.height = v.videoHeight;
        }
        if (result.emit) {
          drawSkeleton(ctx, result.emit.landmarks, { mirror: mirrorRef.current });
        } else {
          clearOverlay(ctx, canvas.width, canvas.height);
        }
      }

      if (result.emit) onLandmarksRef.current?.(result.emit);
    };

    setStatus('loading');
    setDetection('searching');

    createDetector(detectorConfig)
      .then((d) => {
        if (cancelled) {
          d.close();
          return;
        }
        detector = d;
        tick();
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return stop;
    // Restart only when the stream, activity, factory, or detector config change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stream, createDetector, detectorConfig]);

  return { videoRef, canvasRef, status, detection };
}
