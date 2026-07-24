import { useEffect, useRef } from 'react';
import type { SequencerItem, SequencerState } from '../lib/exerciseSequencer';
import { useExerciseSequencer } from '../hooks/useExerciseSequencer';
import './ExerciseInstructionPlayer.css';

export interface ExerciseInstructionPlayerProps {
  /** Ordered exercises to walk through (stable reference — memoise upstream). */
  items: readonly SequencerItem[];
  /** Rest countdown interval (ms). Defaults to 1000; tests pass a small value. */
  restTickMs?: number;
  /**
   * Notified with every sequencer state change — the observability hook for
   * tracking / session-recording features to subscribe to progression.
   */
  onStateChange?: (state: SequencerState) => void;
  /** Called once when the sequence reaches the completion screen. */
  onComplete?: (state: SequencerState) => void;
}

/** Target line: a rep target, or a hold target for isometric exercises. */
function targetLabel(item: SequencerItem): string {
  return item.holdSeconds > 0
    ? `Hold ${item.holdSeconds}s`
    : `Target ${item.targetReps} rep${item.targetReps === 1 ? '' : 's'}`;
}

/** Small demo media / thumbnail, when the exercise carries one. */
function DemoMedia({ item }: { item: SequencerItem }) {
  const src = item.demoMediaRef ?? item.thumbnailUrl;
  if (!src) return null;
  return (
    <img
      className="exercise-player__demo"
      data-testid="demo-media"
      src={src}
      alt={`${item.name} demonstration`}
    />
  );
}

/**
 * Per-exercise instruction screen + player (NIR-766).
 *
 * Drives the {@link useExerciseSequencer} finite-state machine
 * (`idle → instruction → active → rest → complete`) and renders the matching
 * screen for each phase: an instruction card (name, description, demo media,
 * current-set indicator, rep/hold target), the active-set view, a skippable
 * rest countdown, and a completion summary. The Previous / Skip / Next controls
 * map straight onto the deterministic sequencer transitions, so rapid presses
 * can never advance two steps or corrupt the set/exercise cursor.
 */
export function ExerciseInstructionPlayer({
  items,
  restTickMs,
  onStateChange,
  onComplete,
}: ExerciseInstructionPlayerProps) {
  const {
    state,
    item,
    complete,
    exerciseNumber,
    exerciseCount,
    setNumber,
    setCount,
    start,
    begin,
    next,
    previous,
    skip,
  } = useExerciseSequencer(items, restTickMs != null ? { restTickMs } : {});

  // Surface every transition to subscribers (observable requirement).
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Fire completion exactly once.
  const completedRef = useRef(false);
  useEffect(() => {
    if (complete && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(state);
    }
  }, [complete, onComplete, state]);

  const { phase } = state;
  // Previous is a no-op on the very first instruction screen (and while idle).
  const canGoBack = !(phase === 'idle' || (phase === 'instruction' && state.exerciseIndex === 0));

  return (
    <div className="exercise-player" data-testid="exercise-player" data-phase={phase}>
      {phase === 'idle' && (
        <div className="exercise-player__idle" data-testid="idle-panel">
          <p>{exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} in this session.</p>
          <button type="button" data-testid="begin-session-button" onClick={start}>
            Begin session
          </button>
        </div>
      )}

      {complete && (
        <div className="exercise-player__complete" data-testid="session-complete">
          <h2>Session complete</h2>
          <ul className="exercise-player__summary" data-testid="completion-summary">
            {state.results.map((result) => (
              <li key={result.exerciseId} data-outcome={result.outcome}>
                <span className="exercise-player__summary-name">{result.exerciseId}</span>
                <span className="exercise-player__summary-outcome">
                  {result.outcome === 'skipped'
                    ? 'Skipped'
                    : `Completed (${result.completedSets} set${
                        result.completedSets === 1 ? '' : 's'
                      })`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item && phase !== 'idle' && phase !== 'complete' && (
        <div className="exercise-player__stage">
          <p className="exercise-player__progress" data-testid="exercise-progress">
            Exercise {exerciseNumber} of {exerciseCount}
          </p>

          <h2 className="exercise-player__name" data-testid="exercise-name">
            {item.name}
          </h2>

          {item.description && (
            <p className="exercise-player__description" data-testid="exercise-description">
              {item.description}
            </p>
          )}

          <DemoMedia item={item} />

          <p className="exercise-player__set-indicator" data-testid="set-indicator">
            Set <strong>{setNumber}</strong> of {setCount}
          </p>

          <p className="exercise-player__target" data-testid="exercise-target">
            {targetLabel(item)}
          </p>

          {phase === 'instruction' && (
            <p className="exercise-player__hint" data-testid="instruction-hint">
              Review the movement, then start the set.
            </p>
          )}

          {phase === 'active' && (
            <p className="exercise-player__hint" data-testid="active-hint">
              Performing set {setNumber}…
            </p>
          )}

          {phase === 'rest' && (
            <div className="exercise-player__rest" data-testid="rest-panel">
              <p>
                Rest — <strong data-testid="rest-remaining">{state.restRemaining}</strong>s until
                set {setNumber}
              </p>
              <button type="button" data-testid="skip-rest-button" onClick={next}>
                Skip rest
              </button>
            </div>
          )}

          <footer className="exercise-player__controls" data-testid="player-controls">
            <button
              type="button"
              data-testid="previous-button"
              onClick={previous}
              disabled={!canGoBack}
            >
              Previous
            </button>
            <button type="button" data-testid="skip-button" onClick={skip}>
              Skip
            </button>
            {phase === 'instruction' ? (
              <button type="button" data-testid="next-button" onClick={begin}>
                Start set
              </button>
            ) : (
              <button type="button" data-testid="next-button" onClick={next}>
                {phase === 'rest' ? 'Skip rest' : 'Next'}
              </button>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
