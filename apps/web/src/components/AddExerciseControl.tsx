import { useState } from 'react';
import type { TemplateItem } from '../types/template';
import { ITEM_BOUNDS } from '../lib/templateValidation';

export interface AddExerciseControlProps {
  /** Called with a new default item when the doctor adds an exercise. */
  onAdd: (item: TemplateItem) => void;
}

/**
 * Sensible starting dosage for a freshly added item — mid-range values that sit
 * inside every bound so a new item is valid until the doctor tweaks it.
 */
export function defaultTemplateItem(exerciseId: string): TemplateItem {
  return {
    exerciseId: exerciseId.trim(),
    sets: ITEM_BOUNDS.sets.min,
    reps: 10,
    hold: 0,
    rest: 30,
  };
}

/**
 * Add-exercise control shared with the plan builder: enter an exercise id and
 * append a default-dosage item to the current draft.
 */
export function AddExerciseControl({ onAdd }: AddExerciseControlProps) {
  const [exerciseId, setExerciseId] = useState('');

  const submit = () => {
    const trimmed = exerciseId.trim();
    if (!trimmed) return;
    onAdd(defaultTemplateItem(trimmed));
    setExerciseId('');
  };

  return (
    <div className="add-exercise" data-testid="add-exercise">
      <input
        type="text"
        placeholder="Exercise id"
        aria-label="New exercise id"
        data-testid="add-exercise-input"
        value={exerciseId}
        onChange={(e) => setExerciseId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        data-testid="add-exercise-button"
        disabled={exerciseId.trim().length === 0}
        onClick={submit}
      >
        Add exercise
      </button>
    </div>
  );
}
