import { useMemo } from 'react';
import type { Exercise } from '../types/exercise';
import { ExerciseScene } from './ExerciseScene';
import { CameraNotice } from './CameraNotice';
import { useExerciseTracking } from '../hooks/useExerciseTracking';
import type { SequencerExercise } from '../lib/sessionSequencer';
import './SessionPlayer.css';

/** Fallback dosage for the single-exercise practice route (no plan attached). */
const DEFAULT_TARGET_REPS = 10;
const DEFAULT_SETS = 1;
const DEFAULT_REST_SEC = 0;

export interface SessionPlayerProps {
  exercise: Exercise;
  /** Reps that complete one set (defaults to a single set of {@link DEFAULT_TARGET_REPS}). */
  targetReps?: number;
  /** Number of sets to perform. */
  sets?: number;
  /** Rest seconds between sets. */
  restSec?: number;
  /** Session id to PATCH tracked results into. Omit for an unsaved practice run. */
  sessionId?: string;
}

/**
 * Full session player at `/exercise/:id`.
 *
 * Composes the reusable 3D {@link ExerciseScene} with the tracking-wiring
 * ({@link useExerciseTracking}), which now also runs the session sequencer:
 *
 * - Reps (tracked or manually counted) drive the current set; reaching the
 *   target auto-completes the set and advances to rest / the next set / the
 *   next exercise via the sequencer.
 * - Aggregated per-exercise reps/form/ROM are PATCHed to the session as each
 *   exercise finishes (when a `sessionId` is provided).
 * - A manual override ("Count rep" / "Complete set") lets the patient proceed
 *   when tracking stalls; "Next" completes an active set or skips a rest and is
 *   identical to the auto-advance path.
 *
 * It still degrades gracefully across devices: camera denied / no-camera /
 * unsupported / lost mid-session shows a clear {@link CameraNotice} while the
 * manual controls keep the session progressing without losing progress.
 *
 * WebXR gating (Enter-VR vs inline 3D demo) is owned by {@link ExerciseScene}.
 */
export function SessionPlayer({
  exercise,
  targetReps = DEFAULT_TARGET_REPS,
  sets = DEFAULT_SETS,
  restSec = DEFAULT_REST_SEC,
  sessionId,
}: SessionPlayerProps) {
  const exercises = useMemo<SequencerExercise[]>(
    () => [{ exerciseId: exercise.id, name: exercise.name, targetReps, sets, restSec }],
    [exercise.id, exercise.name, targetReps, sets, restSec],
  );

  const {
    mode,
    cameraStatus,
    reps,
    revoked,
    completeRep,
    retryCamera,
    phase,
    setNumber,
    setCount,
    exerciseNumber,
    exerciseCount,
    targetReps: activeTarget,
    repsInSet,
    isComplete,
    completeSet,
    next,
  } = useExerciseTracking({ exercises, sessionId });

  const tracking = mode === 'camera';
  const resting = phase === 'resting';
  const canRecord = phase === 'active';

  return (
    <div
      className="session-player"
      data-testid="session-player"
      data-mode={mode}
      data-phase={phase}
      data-revoked={revoked ? 'true' : 'false'}
      data-complete={isComplete ? 'true' : 'false'}
    >
      <ExerciseScene exercise={exercise} />

      <div className="session-player__chrome" data-testid="player-chrome">
        {mode === 'initialising' ? (
          <div className="session-player__tracking" data-testid="tracking-initialising">
            Starting camera…
          </div>
        ) : tracking ? (
          <div className="session-player__tracking" data-testid="tracking-overlay">
            <span className="session-player__tracking-dot" /> Tracking active
          </div>
        ) : (
          <CameraNotice status={cameraStatus} revoked={revoked} onRetry={retryCamera} />
        )}

        <p className="session-player__set" data-testid="set-progress">
          Exercise {exerciseNumber} of {exerciseCount} · Set{' '}
          <strong>{setNumber}</strong> of {setCount} · {repsInSet}/{activeTarget} reps
        </p>

        <p className="session-player__reps" data-testid="rep-count">
          Reps completed: <strong>{reps}</strong>
        </p>

        {resting && (
          <div className="session-player__rest" data-testid="rest-panel">
            <span>Resting between sets…</span>
            <button
              type="button"
              data-testid="skip-rest-button"
              className="session-player__skip-rest"
              onClick={next}
            >
              Resume
            </button>
          </div>
        )}

        {isComplete && (
          <p className="session-player__complete" data-testid="session-complete">
            Session complete — great work!
          </p>
        )}

        <footer className="session-player__controls" data-testid="player-controls">
          <button
            type="button"
            className="session-player__manual-rep"
            data-testid="manual-rep-button"
            onClick={() => completeRep()}
            disabled={!canRecord}
          >
            Count rep
          </button>
          <button
            type="button"
            className="session-player__complete-set"
            data-testid="complete-set-button"
            onClick={completeSet}
            disabled={!canRecord}
          >
            Complete set
          </button>
          <button
            type="button"
            className="session-player__next"
            data-testid="next-button"
            onClick={next}
            disabled={isComplete}
          >
            Next
          </button>
          <button type="button" data-testid="end-session-button">
            End session
          </button>
        </footer>
      </div>
    </div>
  );
}
