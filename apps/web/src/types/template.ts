/**
 * Domain types for doctor-curated exercise templates.
 *
 * A template is a reusable, named collection of exercise items with default
 * dosage (sets/reps/hold/rest). Plans are built by instantiating a template
 * into a draft, so template items mirror the plan builder's item shape and
 * the same validation bounds apply to both.
 */

/**
 * A single template item: an exercise plus its default dosage. These defaults
 * seed the corresponding plan-draft item when a template is instantiated.
 */
export interface TemplateItem {
  /** Id of the exercise this item references (must resolve to a real exercise). */
  exerciseId: string;
  /** Default number of sets (bounds enforced by validation: 1–10). */
  sets: number;
  /** Default repetitions per set (1–50). */
  reps: number;
  /** Default hold duration in seconds (0–120). */
  hold: number;
  /** Default rest between sets in seconds (0–300). */
  rest: number;
}

/** A persisted template as returned by the API. */
export interface Template {
  id: string;
  name: string;
  /** Optional free-text description shown in the gallery card. */
  description?: string;
  /** Category tags used to group/filter templates in the gallery. */
  categoryTags: string[];
  /** Ordered exercise items with their default dosage. */
  items: TemplateItem[];
}

/**
 * The editable form of a template while a doctor is creating or editing it.
 * `id` is present when editing an existing template, absent when creating.
 */
export interface TemplateDraft {
  id?: string;
  name: string;
  description?: string;
  categoryTags: string[];
  items: TemplateItem[];
}

/** A plan-draft item produced by instantiating a template item. */
export interface PlanDraftItem {
  exerciseId: string;
  sets: number;
  reps: number;
  hold: number;
  rest: number;
  /**
   * Position of the item within the draft. Items instantiated from a template
   * are ordered by array position; extra exercises appended from the library
   * carry an explicit next-order value (see `nextPlanOrder`).
   */
  order?: number;
}

/**
 * A plan draft created from a template via the template-to-draft flow. It keeps
 * a reference back to the source template so the UI can show provenance.
 */
export interface PlanDraft {
  /** Id of the template this draft was instantiated from, if any. */
  templateId?: string;
  name: string;
  items: PlanDraftItem[];
}
