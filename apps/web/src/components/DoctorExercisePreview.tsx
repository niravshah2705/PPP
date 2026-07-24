import { embedExercisePath } from '../lib/embedUrl';
import './DoctorExercisePreview.css';

export interface DoctorExercisePreviewProps {
  exerciseId: string;
  exerciseName?: string;
}

/**
 * Doctor-facing template preview. Embeds the tracking-free demo route in an
 * iframe so the demo visuals stay a single source of truth — no re-implementing
 * the 3D scene here.
 */
export function DoctorExercisePreview({
  exerciseId,
  exerciseName,
}: DoctorExercisePreviewProps) {
  const src = embedExercisePath(exerciseId);
  return (
    <figure className="doctor-preview" data-testid="doctor-preview">
      <iframe
        className="doctor-preview__frame"
        src={src}
        title={
          exerciseName
            ? `Exercise demo preview: ${exerciseName}`
            : 'Exercise demo preview'
        }
        loading="lazy"
        data-testid="doctor-preview-iframe"
      />
      {exerciseName && (
        <figcaption className="doctor-preview__caption">{exerciseName}</figcaption>
      )}
    </figure>
  );
}
