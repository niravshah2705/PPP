import { useEffect, useRef } from 'react';
import type { Exercise } from '../types/exercise';
import { createDemoScene, type DemoSceneHandle } from '../scene/demoScene';
import './ExerciseScene.css';

export interface ExerciseSceneProps {
  exercise: Exercise;
  /**
   * When true, render ONLY the looping 3D demo — no player controls, no
   * tracking overlay, no session chrome. Used by the embeddable route.
   */
  demoOnly?: boolean;
}

/**
 * Single source of truth for the exercise's 3D visuals.
 *
 * The same canvas/demo drives both the full player (with chrome) and the
 * tracking-free embed (`demoOnly`). The underlying WebGL scene autoplays,
 * loops, and releases its GPU resources when the component unmounts.
 */
export function ExerciseScene({ exercise, demoOnly = false }: ExerciseSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        <div className="exercise-scene__chrome" data-testid="player-chrome">
          <header className="exercise-scene__header">
            <h2>{exercise.name}</h2>
            {exercise.description && <p>{exercise.description}</p>}
          </header>
          <div className="exercise-scene__tracking" data-testid="tracking-overlay">
            <span className="exercise-scene__tracking-dot" /> Tracking active
          </div>
          <footer className="exercise-scene__controls" data-testid="player-controls">
            <button type="button">Play</button>
            <button type="button">Pause</button>
            <button type="button">End session</button>
          </footer>
        </div>
      )}
    </div>
  );
}
