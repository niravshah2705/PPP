/**
 * Shared domain type for a curated **plan template** — the stored/seeded shape a
 * doctor starts a plan from.
 *
 * A plan template is a named, reusable bundle of exercise items with sensible
 * default dosage so the doctor can start fast. It is the source-of-truth data
 * behind the read endpoints (`GET /api/templates`, `GET /api/templates/:id`).
 *
 * Note on naming: the stored dosage fields are the fully-qualified
 * `holdSeconds` / `restSeconds`. When a template is served to the client the
 * read handler maps these onto the wire `hold` / `rest` fields the plan builder
 * and preview panel already consume (see `types/template.ts`), so both the
 * curated data and the existing UI stay coherent.
 */

/**
 * A single item in a plan template: a reference to an exercise plus the default
 * dosage that seeds the corresponding plan-draft item when instantiated.
 */
export interface PlanTemplateItem {
  /** Id of the exercise this item references (must resolve to a real exercise). */
  exerciseId: string;
  /** Default number of sets (bounds enforced by validation: 1–10). */
  sets: number;
  /** Default repetitions per set (1–50). */
  reps: number;
  /** Default hold duration in seconds (0–120); 0 for non-hold movements. */
  holdSeconds: number;
  /** Default rest between sets in seconds (0–300). */
  restSeconds: number;
}

/**
 * A curated plan template as stored/seeded on the server.
 *
 * Required fields per the data model: `id`, `name`, `description`, and `items`.
 * `categoryTags` is carried for gallery grouping/filtering (mirrors the wire
 * `Template` shape); it is optional and defaults to an empty list when omitted.
 */
export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  /** Category tags used to group/filter templates in the gallery. */
  categoryTags?: string[];
  /** Ordered exercise items with their default dosage. */
  items: PlanTemplateItem[];
}
