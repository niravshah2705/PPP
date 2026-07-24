import { useParams } from 'react-router-dom';
import { DoctorExercisePreview } from '../components/DoctorExercisePreview';
import { useExercise } from '../hooks/useExercise';

/**
 * Doctor template preview page at `/doctor/preview/:id`. Demonstrates embedding
 * the demo route via iframe.
 */
export function DoctorPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { exercise } = useExercise(id);

  if (!id) return null;

  return (
    <section>
      <h1>Template preview</h1>
      <DoctorExercisePreview exerciseId={id} exerciseName={exercise?.name} />
    </section>
  );
}
