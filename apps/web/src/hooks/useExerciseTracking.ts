import { useCallback, useEffect, useRef, useState } from 'react';
import { requestCamera, type CameraStatus } from '../lib/deviceCapabilities';
import { patchSessionResults } from '../api/sessions';
import {
  advanceSequencer,
  createSequencerState,
  currentExercise,
  exerciseResultAt,
  isSequencerComplete,
  type RepSample,
  type SequencerExercise,
  type SequencerPhase,
  type SequencerState,
  type TrackedExerciseResult,
} from '../lib/sessionSequencer';

/**
 * How the player is currently driving rep progress.
 *
 * - `initialising` — probing the camera.
 * - `camera`       — camera granted; tracking is active.
 * - `manual`       — camera unavailable (or lost); the patient counts reps.
 */
export type TrackingMode = 'initialising' | 'camera' | 'manual';

/** Optional session wiring. Omit entirely for plain freeform rep counting. */
export interface UseExerciseTrackingOptions {
  /**
   * Dosage-driven exercise list to sequence. When present, tracked reps drive
   * set completion + auto-advance; when absent the hook just counts reps.
   */
  exercises?: readonly SequencerExercise[];
  /** Session to PATCH per-exercise results into. Omit to skip persistence. */
  sessionId?: string;
  /** Injectable persistence (defaults to the real PATCH) — used by tests. */
  persist?: (sessionId: string, result: TrackedExerciseResult) => Promise<void> | void;
}

export interface UseExerciseTrackingResult {
  mode: TrackingMode;
  cameraStatus: CameraStatus;
  /**
   * The live camera stream while tracking (`mode === 'camera'`), else `null`.
   * Exposed so the pose feed can run inference on the already-granted stream
   * instead of opening a second `getUserMedia` request.
   */
  stream: MediaStream | null;
  /** Reps recorded so far — never reset by losing the camera. */
  reps: number;
  /** True once a previously-granted camera was lost mid-session. */
  revoked: boolean;
  /**
   * Record one rep (tracked or manually counted). The optional {@link RepSample}
   * carries the per-rep form score / ROM measured by the tracker; the manual
   * "count this rep" override omits it (recorded as not-measured).
   */
  completeRep(sample?: RepSample): void;
  /** Re-probe the camera (e.g. after the patient re-grants permission). */
  retryCamera(): void;

  // --- Sequencer view (inert when no `exercises` were supplied) ---------------
  /** `active` while performing a set, `resting` between sets, `complete` at the end. */
  phase: SequencerPhase;
  /** The exercise in progress, or null once complete / when freeform. */
  currentExerciseId: string | null;
  /** 1-based set number within the current exercise. */
  setNumber: number;
  /** Total sets for the current exercise. */
  setCount: number;
  /** 1-based index of the current exercise. */
  exerciseNumber: number;
  /** Total exercises in the sequence. */
  exerciseCount: number;
  /** Reps that complete the current set. */
  targetReps: number;
  /** Reps counted in the current set so far. */
  repsInSet: number;
  /** True once every set of every exercise is done. */
  isComplete: boolean;
  /**
   * Manual override for stalled tracking: finish the current set now, crediting
   * whatever was counted. Auto-advance and this override share one transition.
   */
  completeSet(): void;
  /** Manual "Next": complete an active set, or skip a pending rest. */
  next(): void;
  /** End the rest interval and resume the next set. */
  endRest(): void;
}

const FREEFORM_PHASE: SequencerPhase = 'active';

/**
 * Tracking-wiring for the session player.
 *
 * On mount it probes the camera. If granted, tracking runs and the live tracks
 * are watched for loss (unplug / revoked permission); any of camera-denied,
 * no-camera, unsupported, or a mid-session loss drops the player into `manual`
 * mode so the patient can still finish by counting reps — recorded progress is
 * preserved across the transition.
 *
 * When `options.exercises` is supplied the hook also drives a
 * {@link SequencerState}: each rep is fed to the sequencer, sets auto-complete
 * at their target and transition to rest/advance, and each exercise's aggregated
 * results are PATCHed to the session as it finishes. Without `exercises` the
 * hook behaves as a plain rep counter.
 */
export function useExerciseTracking(
  options: UseExerciseTrackingOptions = {},
): UseExerciseTrackingResult {
  const { exercises, sessionId, persist } = options;

  const [mode, setMode] = useState<TrackingMode>('initialising');
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [revoked, setRevoked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Freeform rep counter (used only when no exercise sequence is configured).
  const [freeReps, setFreeReps] = useState(0);
  // Sequencer state (used only when an exercise sequence is configured).
  const [seq, setSeq] = useState<SequencerState | null>(() =>
    exercises && exercises.length > 0 ? createSequencerState(exercises) : null,
  );

  // Keep persistence wiring in refs so PATCHing does not depend on the caller's
  // (typically inline) function identity.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    };

    // A previously-granted camera dropped out mid-session: pause tracking and
    // fall back to manual completion WITHOUT touching recorded progress.
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
        setStream(stream);
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

  // PATCH each exercise's aggregated results the moment it finishes. We diff the
  // exercise index across renders so both auto-advance and the manual override
  // (which share one transition) persist identical data exactly once.
  const persistedIndexRef = useRef(0);
  useEffect(() => {
    if (!seq) return;
    const sid = sessionIdRef.current;
    if (!sid) {
      persistedIndexRef.current = seq.exerciseIndex;
      return;
    }
    const save = persistRef.current ?? patchSessionResults;
    for (let i = persistedIndexRef.current; i < seq.exerciseIndex; i += 1) {
      const result = exerciseResultAt(seq, i);
      if (result) {
        Promise.resolve()
          .then(() => save(sid, result))
          .catch(() => {
            /* best-effort persistence */
          });
      }
    }
    persistedIndexRef.current = seq.exerciseIndex;
  }, [seq]);

  const completeRep = useCallback(
    (sample: RepSample = {}) => {
      if (exercises && exercises.length > 0) {
        setSeq((prev) => (prev ? advanceSequencer(prev, { type: 'rep', ...sample }) : prev));
      } else {
        setFreeReps((n) => n + 1);
      }
    },
    [exercises],
  );

  const completeSet = useCallback(() => {
    setSeq((prev) => (prev ? advanceSequencer(prev, { type: 'completeSet' }) : prev));
  }, []);

  const next = useCallback(() => {
    setSeq((prev) => (prev ? advanceSequencer(prev, { type: 'next' }) : prev));
  }, []);

  const endRest = useCallback(() => {
    setSeq((prev) => (prev ? advanceSequencer(prev, { type: 'endRest' }) : prev));
  }, []);

  const retryCamera = useCallback(() => setAttempt((n) => n + 1), []);

  // Derive the public view. The reps total is the sum of tracked reps in
  // sequencer mode, otherwise the freeform counter.
  const reps = seq
    ? seq.accumulators.reduce((sum, a) => sum + a.completedReps, 0)
    : freeReps;
  const activeExercise = seq ? currentExercise(seq) : null;
  const seqExercise = seq ? seq.exercises[seq.exerciseIndex] : undefined;

  return {
    mode,
    cameraStatus,
    stream,
    reps,
    revoked,
    completeRep,
    retryCamera,
    phase: seq ? seq.phase : FREEFORM_PHASE,
    currentExerciseId: activeExercise?.exerciseId ?? null,
    setNumber: seq ? seq.setIndex + 1 : 1,
    setCount: seqExercise?.sets ?? 1,
    exerciseNumber: seq ? Math.min(seq.exerciseIndex + 1, seq.exercises.length) : 1,
    exerciseCount: seq ? seq.exercises.length : 1,
    targetReps: seqExercise?.targetReps ?? 0,
    repsInSet: seq ? seq.repsInSet : freeReps,
    isComplete: seq ? isSequencerComplete(seq) : false,
    completeSet,
    next,
    endRest,
  };
}
