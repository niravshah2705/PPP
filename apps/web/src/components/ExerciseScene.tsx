import { useCallback, useEffect, useRef, useState } from 'react';
import type { Exercise } from '../types/exercise';
import { createDemoScene, type DemoSceneHandle } from '../scene/demoScene';
import { useWebXRSupport } from '../hooks/useWebXRSupport';
import './ExerciseScene.css';

type VrEntry = 'idle' | 'entering' | 'error';

export interface ExerciseSceneProps {
  exercise: Exercise;
  /**
   * When true, render ONLY the looping 3D demo — no header, no Enter-VR button,
   * no session chrome. Used by the embeddable route.
   */
  demoOnly?: boolean;
}

/**
 * Single source of truth for the exercise's 3D visuals.
 *
 * The same canvas/demo drives both the full player and the tracking-free embed
 * (`demoOnly`). The underlying WebGL scene autoplays, loops, and releases its
 * GPU resources when the component unmounts.
 *
 * The inline 3D demo ALWAYS renders — it is the 2D-screen fallback used when the
 * device can't enter immersive VR. The Enter-VR button is shown only when the
 * browser reports WebXR support, so a WebXR-unsupported device sees the inline
 * demo with no dead Enter-VR affordance.
 */
export function ExerciseScene({ exercise, demoOnly = false }: ExerciseSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<DemoSceneHandle | undefined>(undefined);
  const [vrEntry, setVrEntry] = useState<VrEntry>('idle');
  // The embed never offers immersive VR, so skip the probe there.
  const webXR = useWebXRSupport(!demoOnly);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let handle: DemoSceneHandle | undefined;
    try {
      handle = createDemoScene(canvas, {
        accentColor: exercise.accentColor,
        demoClip: exercise.demoClip,
      });
      handleRef.current = handle;
    } catch (err) {
      // A missing WebGL context should not blank the page; leave the canvas
      // element in place and surface the failure to diagnostics only.
      console.error('Failed to initialise demo scene', err);
    }

    // A fresh scene per exercise starts from a clean Enter-VR state.
    setVrEntry('idle');

    return () => {
      // Release WebGL resources on unmount (or exercise change).
      handle?.dispose();
      handleRef.current = undefined;
    };
  }, [exercise.id, exercise.accentColor, exercise.demoClip]);

  const handleEnterVR = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) {
      setVrEntry('error');
      return;
    }
    setVrEntry('entering');
    // enterVR never rejects, but guard anyway so a click can never crash the UI.
    const result = await handle.enterVR().catch(() => ({ status: 'rejected' as const }));
    setVrEntry(result.status === 'started' ? 'idle' : 'error');
  }, []);

  return (
    <div
      className={demoOnly ? 'exercise-scene exercise-scene--demo' : 'exercise-scene'}
      data-demo-only={demoOnly ? 'true' : 'false'}
      data-testid="exercise-scene"
    >
      <canvas
        ref={canvasRef}
        className="exercise-scene__canvas"
        aria-label={`3D demo of ${exercise.name}`}
        data-testid="exercise-scene-canvas"
      />

      {!demoOnly && (
        <div className="exercise-scene__chrome" data-testid="scene-chrome">
          <header className="exercise-scene__header">
            <h2>{exercise.name}</h2>
            {exercise.description && <p>{exercise.description}</p>}
          </header>
          {webXR === 'supported' && (
            <div className="exercise-scene__vr">
              <button
                type="button"
                className="exercise-scene__enter-vr"
                data-testid="enter-vr-button"
                onClick={handleEnterVR}
                disabled={vrEntry === 'entering'}
                aria-busy={vrEntry === 'entering'}
              >
                {vrEntry === 'entering' ? 'Starting VR…' : 'Enter VR'}
              </button>
              {vrEntry === 'error' && (
                <p className="exercise-scene__vr-error" role="alert" data-testid="enter-vr-error">
                  Couldn’t start the immersive session. The inline 3D demo is still available.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
