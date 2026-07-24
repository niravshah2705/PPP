import { useParams } from 'react-router-dom';
import { ExerciseScene } from '../components/ExerciseScene';
import { InlineErrorCard } from '../components/InlineErrorCard';
import { useExercise } from '../hooks/useExercise';

/**
 * Full session player at `/exercise/:id`. Reuses the same {@link ExerciseScene}
 * as the embed route, but WITH player/tracking chrome — proving the scene is a
 * single source of truth for the demo visuals.
 */
export function ExercisePlayer() {
  const { id } = useParams<{ id: string }>();
  const { status, exercise } = useExercise(id);

  if (status === 'loading') return <p>Loading exercise…</p>;
  if (status === 'ready' && exercise) return <ExerciseScene exercise={exercise} />;

  return (
    <InlineErrorCard
      title="Exercise unavailable"
      message={`No exercise found for id "${id ?? ''}".`}
    />
  );
}
