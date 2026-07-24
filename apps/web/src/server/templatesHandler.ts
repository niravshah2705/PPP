import type { Exercise } from '../types/exercise';
import type { ErrorEnvelope } from '../types/errorEnvelope';
import { errorEnvelope } from '../types/errorEnvelope';
import type { PlanTemplate, PlanTemplateItem } from '../types/planTemplate';
import type {
  Template,
  TemplateDetail,
  TemplateItem,
  TemplatePreviewExercise,
  TemplatePreviewItem,
} from '../types/template';
import { EXERCISE_CATALOG, indexExercisesById } from './fixtures/exercises';
import { PLAN_TEMPLATES } from './fixtures/planTemplates';

/**
 * Server-side read behavior for plan templates — the handler core behind
 * `GET /api/templates` and `GET /api/templates/:id`.
 *
 * These are pure functions over the seeded fixtures (dependencies are injectable
 * for testing). The HTTP layer only needs to translate the returned
 * `{ status, body }` into a response.
 */

/** Minimal logger surface the handlers use to report filtered-out items. */
export interface Logger {
  warn(message: string): void;
}

/** Injectable dependencies for the read handlers; all default to the seed data. */
export interface TemplateReadDeps {
  templates?: readonly PlanTemplate[];
  exercises?: readonly Exercise[];
  logger?: Logger;
}

/** A template list entry: the gallery shape plus an explicit item count. */
export interface TemplateSummary extends Template {
  /** Number of items declared on the template. */
  itemCount: number;
}

/** A JSON response envelope with a numeric HTTP status. */
export interface JsonResponse<T> {
  status: number;
  body: T;
}

/** Error code returned when a template id does not resolve. */
export const TEMPLATE_NOT_FOUND_CODE = 'template_not_found';

const defaultLogger: Logger = {
  // eslint-disable-next-line no-console
  warn: (message: string) => console.warn(message),
};

/**
 * Map a stored {@link PlanTemplateItem} (holdSeconds/restSeconds) onto the wire
 * {@link TemplateItem} (hold/rest) the plan builder and preview already consume.
 */
function toTemplateItem(item: PlanTemplateItem): TemplateItem {
  return {
    exerciseId: item.exerciseId,
    sets: item.sets,
    reps: item.reps,
    hold: item.holdSeconds,
    rest: item.restSeconds,
  };
}

/** Build the gallery summary (with item count) for a single template. */
function toSummary(template: PlanTemplate): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    categoryTags: template.categoryTags ?? [],
    items: template.items.map(toTemplateItem),
    itemCount: template.items.length,
  };
}

/** Project an exercise down to the fields the preview panel needs. */
function toPreviewExercise(exercise: Exercise): TemplatePreviewExercise {
  return {
    id: exercise.id,
    name: exercise.name,
    thumbnailUrl: exercise.thumbnailUrl,
    demoMediaRef: exercise.demoMediaRef,
  };
}

/**
 * List all templates as gallery summaries (`GET /api/templates`). Each entry
 * carries `itemCount` alongside its items so the gallery can show a count.
 */
export function listTemplateSummaries(deps: TemplateReadDeps = {}): TemplateSummary[] {
  const templates = deps.templates ?? PLAN_TEMPLATES;
  return templates.map(toSummary);
}

/**
 * Expand one template into its preview detail (`GET /api/templates/:id`).
 *
 * Each item's exercise is joined in so the client gets names + media without an
 * extra call. Items whose `exerciseId` no longer resolves are **filtered out and
 * logged** (data-integrity guard); `itemCount` reports the declared total before
 * filtering so the UI can note how many were unavailable.
 */
export function expandTemplateDetail(
  template: PlanTemplate,
  deps: TemplateReadDeps = {},
): TemplateDetail {
  const index = indexExercisesById(deps.exercises ?? EXERCISE_CATALOG);
  const logger = deps.logger ?? defaultLogger;

  const items: TemplatePreviewItem[] = [];
  for (const item of template.items) {
    const exercise = index.get(item.exerciseId);
    if (!exercise) {
      logger.warn(
        `Template "${template.id}" references missing exercise "${item.exerciseId}"; item filtered out.`,
      );
      continue;
    }
    items.push({ ...toTemplateItem(item), exercise: toPreviewExercise(exercise) });
  }

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    categoryTags: template.categoryTags ?? [],
    // Declared total (before missing-exercise items were filtered out).
    itemCount: template.items.length,
    items,
  };
}

/**
 * Handler for `GET /api/templates` — always 200 with the summary list.
 */
export function handleListTemplates(
  deps: TemplateReadDeps = {},
): JsonResponse<TemplateSummary[]> {
  return { status: 200, body: listTemplateSummaries(deps) };
}

/**
 * Handler for `GET /api/templates/:id`.
 *
 * - Found -> 200 with the expanded {@link TemplateDetail}.
 * - Unknown id -> 404 with a standard {@link ErrorEnvelope}.
 */
export function handleGetTemplate(
  id: string,
  deps: TemplateReadDeps = {},
): JsonResponse<TemplateDetail> | JsonResponse<ErrorEnvelope> {
  const templates = deps.templates ?? PLAN_TEMPLATES;
  const template = templates.find((t) => t.id === id);
  if (!template) {
    return {
      status: 404,
      body: errorEnvelope(TEMPLATE_NOT_FOUND_CODE, `Template "${id}" was not found`),
    };
  }
  return { status: 200, body: expandTemplateDetail(template, deps) };
}
