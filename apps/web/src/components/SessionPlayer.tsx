import type { Exercise } from '../types/exercise';
import { ExerciseScene } from './ExerciseScene';
import { CameraNotice } from './CameraNotice';
import { useExerciseTracking } from '../hooks/useExerciseTracking';
import './SessionPlayer.css';

export interface SessionPlayerProps {
  exercise: Exercise;
}

/**
 * Full session player at `/exercise/:id`.
 *
 * Composes the reusable 3D {@link ExerciseScene} with the tracking-wiring
 * ({@link useExerciseTracking}). It degrades gracefully across devices:
 *
 * - Camera granted → tracking overlay is active.
 * - Camera denied / no-camera / unsupported → a clear {@link CameraNotice} and
 *   a manual "Count rep" control so the session still progresses.
 * - Camera lost mid-session → tracking pauses, the patient is offered manual
 *   completion, and the recorded rep count is preserved.
 *
 * WebXR gating (Enter-VR vs inline 3D demo) is owned by {@link ExerciseScene}.
 */
export function SessionPlayer({ exercise }: SessionPlayerProps) {
  const { mode, cameraStatus, reps, revoked, completeRep, retryCamera } = useExerciseTracking();
  const tracking = mode === 'camera';

  return (
    <div
      className="session-player"
      data-testid="session-player"
      data-mode={mode}
      data-revoked={revoked ? 'true' : 'false'}
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

        <p className="session-player__reps" data-testid="rep-count">
          Reps completed: <strong>{reps}</strong>
        </p>

        <footer className="session-player__controls" data-testid="player-controls">
          {!tracking && (
            <button
              type="button"
              className="session-player__manual-rep"
              data-testid="manual-rep-button"
              onClick={completeRep}
            >
              Count rep
            </button>
          )}
          <button type="button" data-testid="end-session-button">
            End session
          </button>
        </footer>
      </div>
    </div>
  );
}
