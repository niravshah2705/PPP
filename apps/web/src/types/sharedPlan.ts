import type { ExerciseTracking } from './exercise';
import type { PlanDraftItem } from './template';

/**
 * The patient-facing plan payload returned by `GET /api/plans/:id/share`.
 *
 * This is the minimal, stable shape the shareable deep link
 * (`/patient?planId=...`) resolves through. It deliberately decouples the
 * patient view from the full {@link Plan} schema: editing-only/internal metadata
 * (source template provenance, `createdAt`/`updatedAt`) is stripped, and every
 * item's exercise is expanded inline so the patient view can render the plan
 * overview and run the session without any further calls.
 */

/**
 * An exercise expanded onto a shared-plan item — only the fields the patient
 * view needs to render the movement (name, media, accent) and drive the
 * rep-counter (its {@link ExerciseTracking} config). Catalogue-internal wiring
 * beyond these fields is not carried.
 */
export interface SharedPlanExercise {
  id: string;
  name: string;
  /** Short human-readable description shown to the patient. */
  description?: string;
  /** Category the exercise belongs to (e.g. "knee"), for grouping/tags. */
  category?: string;
  /** Accent colour (hex) used by the demo scene. */
  accentColor?: string;
  /** Small preview image URL, when the exercise has one. */
  thumbnailUrl?: string;
  /** Reference to the demo media clip; also a thumbnail fallback. */
  demoMediaRef?: string;
  /** Identifier/URL of the demo animation clip for the looping 3D scene. */
  demoClip?: string;
  /** Rep-counter tracking config, when the exercise supports pose tracking. */
  tracking?: ExerciseTracking;
}

/**
 * A shared-plan item: the plan's dosage ({@link PlanDraftItem}) with its
 * exercise resolved inline so no second lookup is needed to render it.
 */
export interface SharedPlanItem extends PlanDraftItem {
  /** The resolved exercise for {@link PlanDraftItem.exerciseId}. */
  exercise: SharedPlanExercise;
}

/**
 * A patient-facing plan. Carries only what the patient view renders/runs: the
 * plan id (the deep-link key), the assigned patient's name, and the expanded,
 * ordered items. Editing-only/internal plan metadata is intentionally absent.
 */
export interface SharedPlan {
  id: string;
  patientName: string;
  items: SharedPlanItem[];
}
