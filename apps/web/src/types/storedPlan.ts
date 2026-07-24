/**
 * Persistence domain types for a **stored plan** — the doctor's saved output that
 * a patient later loads, and the core hand-off object between the two views.
 *
 * A stored plan is the server-owned record behind the write/read endpoints
 * (`POST /api/plans`, `GET /api/plans/:id`, `GET /api/plans?patientName=`,
 * `PUT /api/plans/:id`). It carries server-managed identity/timestamps plus the
 * ordered exercise items with their dosage.
 *
 * Note on naming: the stored dosage fields are the fully-qualified
 * `holdSeconds` / `restSeconds` (mirroring {@link ./planTemplate.ts}), not the
 * wire `hold` / `rest` the plan builder consumes. The bounds enforced on these
 * fields are the single source of truth in {@link ../lib/planPersistenceValidation.ts}.
 */

/**
 * A single stored plan item: a reference to an exercise plus its dosage and an
 * explicit position. Ordering is driven entirely by {@link order}, so reordering
 * a plan is a matter of rewriting these values on update.
 */
export interface StoredPlanItem {
  /** Id of the exercise this item references (must resolve to a real exercise). */
  exerciseId: string;
  /** Number of sets (bounds enforced by validation: 1–10). */
  sets: number;
  /** Repetitions per set (1–50). */
  reps: number;
  /** Hold duration in seconds (0–120); 0 for non-hold movements. */
  holdSeconds: number;
  /** Rest between sets in seconds (0–300). */
  restSeconds: number;
  /** Position of the item within the plan; items are returned sorted by this. */
  order: number;
}

/**
 * A persisted plan as stored on the server and returned by the read endpoints.
 *
 * `id`, `createdAt`, and `updatedAt` are server-managed: `id` is generated on
 * create, `createdAt` is set once and preserved across edits, and `updatedAt` is
 * bumped on every write. Clients never supply these.
 */
export interface StoredPlan {
  /** Server-generated id; also the patient deep-link key. */
  id: string;
  /** Patient the plan is assigned to (searched case-insensitively in the list). */
  patientName: string;
  /** Id of the source template this plan was built from, if any. */
  sourceTemplateId?: string;
  /** Free-text notes the doctor attached to the plan. */
  notes?: string;
  /** Ordered exercise items with their dosage. */
  items: StoredPlanItem[];
  /**
   * ISO timestamp of when the plan was first persisted. Server-managed: set once
   * on create and preserved across edits (an update bumps `updatedAt`, never
   * this), so the record's origin stays stable.
   */
  createdAt: string;
  /** ISO timestamp of the last write; bumped on every create/update. */
  updatedAt: string;
}

/**
 * The client-supplied payload for `POST /api/plans` and `PUT /api/plans/:id`.
 *
 * It carries only the fields a client owns — server-managed identity/timestamps
 * (`id`, `createdAt`, `updatedAt`) are never accepted from the wire and are set
 * by the handler instead.
 */
export interface PlanInput {
  patientName: string;
  sourceTemplateId?: string;
  notes?: string;
  items: StoredPlanItem[];
}
