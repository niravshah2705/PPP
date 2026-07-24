import { useCallback, useEffect, useRef, useState } from 'react';
import { requestCamera, type CameraStatus } from '../lib/deviceCapabilities';

/**
 * How the player is currently driving rep progress.
 *
 * - `initialising` — probing the camera.
 * - `camera`       — camera granted; tracking is active.
 * - `manual`       — camera unavailable (or lost); the patient counts reps.
 */
export type TrackingMode = 'initialising' | 'camera' | 'manual';

export interface UseExerciseTrackingResult {
  mode: TrackingMode;
  cameraStatus: CameraStatus;
  /** Reps recorded so far — never reset by losing the camera. */
  reps: number;
  /** True once a previously-granted camera was lost mid-session. */
  revoked: boolean;
  /** Record one manually-counted rep. */
  completeRep(): void;
  /** Re-probe the camera (e.g. after the patient re-grants permission). */
  retryCamera(): void;
}

/**
 * Tracking-wiring for the session player.
 *
 * On mount it probes the camera. If granted, tracking runs and the live tracks
 * are watched for loss (unplug / revoked permission). Any of camera-denied,
 * no-camera, unsupported, or a mid-session loss drops the player into `manual`
 * mode so the patient can still finish by counting reps — recorded reps are
 * preserved across the transition so no progress is lost.
 */
export function useExerciseTracking(): UseExerciseTrackingResult {
  const [mode, setMode] = useState<TrackingMode>('initialising');
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [reps, setReps] = useState(0);
  const [revoked, setRevoked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    // A previously-granted camera dropped out mid-session: pause tracking and
    // fall back to manual completion WITHOUT touching the recorded rep count.
    const handleLost = () => {
      if (cancelled) return;
      stopStream();
      setRevoked(true);
      setCameraStatus('lost');
      setMode('manual');
    };

    requestCamera().then(({ status, stream }) => {
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      setCameraStatus(status);
      if (status === 'granted' && stream) {
        streamRef.current = stream;
        setRevoked(false);
        setMode('camera');
        stream.getTracks().forEach((track) => {
          track.addEventListener('ended', handleLost);
          track.addEventListener('mute', handleLost);
        });
      } else {
        setMode('manual');
      }
    });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [attempt]);

  const completeRep = useCallback(() => setReps((n) => n + 1), []);
  const retryCamera = useCallback(() => setAttempt((n) => n + 1), []);

  return { mode, cameraStatus, reps, revoked, completeRep, retryCamera };
}
