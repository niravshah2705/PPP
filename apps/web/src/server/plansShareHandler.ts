import type { Exercise } from '../types/exercise';
import type { ErrorEnvelope } from '../types/errorEnvelope';
import { errorEnvelope } from '../types/errorEnvelope';
import type { Plan } from '../types/plan';
import type {
  SharedPlan,
  SharedPlanExercise,
  SharedPlanItem,
} from '../types/sharedPlan';
import { EXERCISE_CATALOG, indexExercisesById } from './fixtures/exercises';
import { SEED_PLANS } from './fixtures/plans';
import type { JsonResponse, Logger } from './templatesHandler';

/**
 * Server-side read behavior for the plan share / deep-link endpoint — the
 * handler core behind `GET /api/plans/:id/share`.
 *
 * It resolves a persisted {@link Plan} and projects it down to the patient-facing
 * {@link SharedPlan}: editing-only/internal metadata is stripped and each item's
 * exercise is joined in so the patient view renders the plan overview (and runs
 * the session) purely from this payload, without any further calls. Items whose
 * `exerciseId` no longer resolves are filtered out and logged, mirroring template
 * expansion — a patient can't render a movement whose exercise is gone.
 *
 * These are pure functions over the seeded fixtures (dependencies are injectable
 * for testing); the HTTP layer only translates the `{ status, body }` result.
 */

/** Error code returned when a plan id does not resolve. */
export const PLAN_NOT_FOUND_CODE = 'plan_not_found';

/** Injectable dependencies for the share handler; all default to the seed data. */
export interface PlanShareReadDeps {
  plans?: readonly Plan[];
  exercises?: readonly Exercise[];
  logger?: Logger;
}

const defaultLogger: Logger = {
  // eslint-disable-next-line no-console
  warn: (message: string) => console.warn(message),
};

/** Project an exercise down to the patient-safe fields the shared payload needs. */
function toSharedExercise(exercise: Exercise): SharedPlanExercise {
  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    category: exercise.category,
    accentColor: exercise.accentColor,
    thumbnailUrl: exercise.thumbnailUrl,
    demoMediaRef: exercise.demoMediaRef,
    demoClip: exercise.demoClip,
    tracking: exercise.tracking,
  };
}

/**
 * Expand a stored {@link Plan} into its patient-facing {@link SharedPlan}.
 *
 * Editing-only/internal fields (`templateId`, `templateName`, `createdAt`,
 * `updatedAt`) are dropped. Each item keeps its dosage and carries its resolved
 * exercise inline; items in declared order. Items whose exercise no longer
 * resolves are filtered out and logged so the payload never references a movement
 * the patient can't render.
 */
export function expandPlanForShare(
  plan: Plan,
  deps: PlanShareReadDeps = {},
): SharedPlan {
  const index = indexExercisesById(deps.exercises ?? EXERCISE_CATALOG);
  const logger = deps.logger ?? defaultLogger;

  const items: SharedPlanItem[] = [];
  for (const item of plan.items) {
    const exercise = index.get(item.exerciseId);
    if (!exercise) {
      logger.warn(
        `Plan "${plan.id}" references missing exercise "${item.exerciseId}"; item filtered out.`,
      );
      continue;
    }
    items.push({
      exerciseId: item.exerciseId,
      sets: item.sets,
      reps: item.reps,
      hold: item.hold,
      rest: item.rest,
      order: item.order,
      exercise: toSharedExercise(exercise),
    });
  }

  return {
    id: plan.id,
    patientName: plan.patientName,
    items,
  };
}

/**
 * Handler for `GET /api/plans/:id/share`.
 *
 * - Found -> 200 with the patient-facing {@link SharedPlan}.
 * - Unknown id -> 404 with a standard {@link ErrorEnvelope} (consumed by the
 *   patient empty state).
 */
export function handleGetPlanShare(
  id: string,
  deps: PlanShareReadDeps = {},
): JsonResponse<SharedPlan> | JsonResponse<ErrorEnvelope> {
  const plans = deps.plans ?? SEED_PLANS;
  const plan = plans.find((p) => p.id === id);
  if (!plan) {
    return {
      status: 404,
      body: errorEnvelope(PLAN_NOT_FOUND_CODE, `Plan "${id}" was not found`),
    };
  }
  return { status: 200, body: expandPlanForShare(plan, deps) };
}
