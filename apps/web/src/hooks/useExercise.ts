import { useEffect, useState } from 'react';
import type { Exercise } from '../types/exercise';
import { ExerciseNotFoundError, fetchExercise } from '../api/exercises';

export type ExerciseStatus = 'loading' | 'ready' | 'not-found' | 'error';

export interface UseExerciseResult {
  status: ExerciseStatus;
  exercise?: Exercise;
  error?: string;
}

/** Load an exercise by id, mapping failures to a discriminated status. */
export function useExercise(id: string | undefined): UseExerciseResult {
  const [result, setResult] = useState<UseExerciseResult>({ status: 'loading' });

  useEffect(() => {
    if (!id) {
      setResult({ status: 'not-found' });
      return;
    }

    const controller = new AbortController();
    setResult({ status: 'loading' });

    fetchExercise(id, controller.signal)
      .then((exercise) => setResult({ status: 'ready', exercise }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ExerciseNotFoundError) {
          setResult({ status: 'not-found' });
        } else {
          setResult({
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      });

    return () => controller.abort();
  }, [id]);

  return result;
}
