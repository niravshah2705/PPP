import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '../types/exercise';
import { listExercises } from '../api/exercises';
import './ExercisePicker.css';

export interface ExercisePickerProps {
  /** Exercise ids already in the draft — used to flag duplicates. */
  existingExerciseIds?: ReadonlySet<string>;
  /** Called with the chosen exercise when the doctor adds it to the draft. */
  onSelect: (exercise: Exercise) => void;
}

/**
 * Case-insensitive match of an exercise against a search query. Matches on
 * name and category so the doctor can filter the library by either.
 */
function matchesQuery(exercise: Exercise, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystacks = [exercise.name, exercise.category ?? ''];
  return haystacks.some((value) => value.toLowerCase().includes(q));
}

/**
 * Searchable "Add exercise" picker sourced from `GET /api/exercises`. Filters
 * the library by name and category, shows category tags and thumbnails to aid
 * selection, flags exercises already in the plan with an "already in plan"
 * badge (duplicates are still permitted), and renders a clear no-matches state
 * for an empty result instead of a blank list. Selecting an exercise appends it
 * to the draft via `onSelect`.
 */
export function ExercisePicker({ existingExerciseIds, onSelect }: ExercisePickerProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    listExercises(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setExercises(list);
        setStatus('ready');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const matches = useMemo(
    () => exercises.filter((exercise) => matchesQuery(exercise, query)),
    [exercises, query],
  );

  return (
    <div className="exercise-picker" data-testid="exercise-picker">
      <label className="exercise-picker__search">
        <span>Add exercise</span>
        <input
          type="search"
          placeholder="Search by name or category"
          aria-label="Search exercises"
          data-testid="exercise-picker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {status === 'loading' && (
        <p className="exercise-picker__status" data-testid="exercise-picker-loading">
          Loading exercises…
        </p>
      )}

      {status === 'error' && (
        <p
          className="exercise-picker__status"
          role="alert"
          data-testid="exercise-picker-error"
        >
          Failed to load exercises.
        </p>
      )}

      {status === 'ready' && matches.length === 0 && (
        <p className="exercise-picker__empty" data-testid="exercise-picker-no-matches">
          No exercises match “{query.trim()}”.
        </p>
      )}

      {status === 'ready' && matches.length > 0 && (
        <ul className="exercise-picker__list" data-testid="exercise-picker-list">
          {matches.map((exercise) => {
            const alreadyInPlan = existingExerciseIds?.has(exercise.id) ?? false;
            return (
              <li key={exercise.id} className="exercise-picker__item">
                <button
                  type="button"
                  className="exercise-picker__option"
                  data-testid={`exercise-option-${exercise.id}`}
                  onClick={() => onSelect(exercise)}
                >
                  {exercise.thumbnailUrl ? (
                    <img
                      className="exercise-picker__thumb"
                      src={exercise.thumbnailUrl}
                      alt=""
                      data-testid={`exercise-thumb-${exercise.id}`}
                    />
                  ) : (
                    <span className="exercise-picker__thumb exercise-picker__thumb--empty" aria-hidden />
                  )}
                  <span className="exercise-picker__meta">
                    <span className="exercise-picker__name">{exercise.name}</span>
                    {exercise.category && (
                      <span
                        className="exercise-picker__tag"
                        data-testid={`exercise-category-${exercise.id}`}
                      >
                        {exercise.category}
                      </span>
                    )}
                  </span>
                  {alreadyInPlan && (
                    <span
                      className="exercise-picker__badge"
                      data-testid={`exercise-already-${exercise.id}`}
                    >
                      already in plan
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
