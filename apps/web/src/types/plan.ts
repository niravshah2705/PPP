import type { PlanDraftItem } from './template';

/**
 * A persisted plan as returned by `GET /api/plans` — one prescription assigned
 * to a patient, built from a template and later editable in the builder. The
 * doctor's manage view lists these so recent work can be found, reopened,
 * copied, or duplicated.
 */
export interface Plan {
  /** Server id; also the patient deep-link key (see `patientPlanPath`). */
  id: string;
  /** Patient the plan is assigned to (shown/searched in the list). */
  patientName: string;
  /** Id of the source template this plan was built from, if any. */
  templateId?: string;
  /** Name of the source template, for display/search. */
  templateName?: string;
  /** Ordered exercise items with their dosage. */
  items: PlanDraftItem[];
  /** ISO timestamp of the last edit; drives newest-first ordering. */
  updatedAt: string;
}
