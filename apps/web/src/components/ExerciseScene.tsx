import { useEffect, useRef } from 'react';
import type { Exercise } from '../types/exercise';
import { createDemoScene, type DemoSceneHandle } from '../scene/demoScene';
import { useWebXRSupport } from '../hooks/useWebXRSupport';
import './ExerciseScene.css';

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
    } catch (err) {
      // A missing WebGL context should not blank the page; leave the canvas
      // element in place and surface the failure to diagnostics only.
      console.error('Failed to initialise demo scene', err);
    }

    return () => {
      // Release WebGL resources on unmount (or exercise change).
      handle?.dispose();
    };
  }, [exercise.id, exercise.accentColor, exercise.demoClip]);

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
            <button
              type="button"
              className="exercise-scene__enter-vr"
              data-testid="enter-vr-button"
            >
              Enter VR
            </button>
          )}
        </div>
      )}
    </div>
  );
}
