import { useParams } from 'react-router-dom';
import { ExerciseScene } from '../components/ExerciseScene';
import { InlineErrorCard } from '../components/InlineErrorCard';
import { useExercise } from '../hooks/useExercise';
import './EmbedExercise.css';

/**
 * Route `/embed/exercise/:id`.
 *
 * Renders ONLY the looping 3D demo scene (`demoOnly`) — no player controls, no
 * tracking UI, no session chrome — so it can be dropped into an iframe (e.g. the
 * doctor template preview). An invalid id renders a compact inline error card
 * rather than a blank page.
 */
export function EmbedExercise() {
  const { id } = useParams<{ id: string }>();
  const { status, exercise } = useExercise(id);

  return (
    <div className="embed-exercise" data-testid="embed-exercise">
      {status === 'loading' && (
        <div className="embed-exercise__loading" data-testid="embed-loading">
          Loading demo…
        </div>
      )}

      {status === 'ready' && exercise && (
        <ExerciseScene exercise={exercise} demoOnly />
      )}

      {status === 'not-found' && (
        <InlineErrorCard
          title="Exercise unavailable"
          message={`No demo found for id "${id ?? ''}".`}
        />
      )}

      {status === 'error' && (
        <InlineErrorCard
          title="Couldn’t load demo"
          message="Something went wrong loading this exercise. Please try again."
        />
      )}
    </div>
  );
}
