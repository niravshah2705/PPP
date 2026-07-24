import { useParams } from 'react-router-dom';
import { SessionPlayer } from '../components/SessionPlayer';
import { InlineErrorCard } from '../components/InlineErrorCard';
import { useExercise } from '../hooks/useExercise';

/**
 * Full session player at `/exercise/:id`. Wraps the reusable {@link ExerciseScene}
 * (shared with the embed route) in tracking-wiring that degrades gracefully when
 * the camera or WebXR is unavailable — see {@link SessionPlayer}.
 */
export function ExercisePlayer() {
  const { id } = useParams<{ id: string }>();
  const { status, exercise } = useExercise(id);

  if (status === 'loading') return <p>Loading exercise…</p>;
  if (status === 'ready' && exercise) return <SessionPlayer exercise={exercise} />;

  return (
    <InlineErrorCard
      title="Exercise unavailable"
      message={`No exercise found for id "${id ?? ''}".`}
    />
  );
}
