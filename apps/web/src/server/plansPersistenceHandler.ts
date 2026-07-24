import type { Exercise } from '../types/exercise';
import type { ErrorEnvelope } from '../types/errorEnvelope';
import { errorEnvelope } from '../types/errorEnvelope';
import type { PlanInput, StoredPlan, StoredPlanItem } from '../types/storedPlan';
import type { FieldError } from '../lib/templateValidation';
import { validatePlanInput } from '../lib/planPersistenceValidation';
import { EXERCISE_CATALOG, indexExercisesById } from './fixtures/exercises';
import { InMemoryPlanStore, type PlanStore } from './planStore';
import { PLAN_NOT_FOUND_CODE } from './plansShareHandler';
import type { JsonResponse } from './templatesHandler';

/**
 * Server-side create/read/update persistence behavior for plans — the handler
 * core behind `POST /api/plans`, `GET /api/plans/:id`,
 * `GET /api/plans?patientName=`, and `PUT /api/plans/:id`.
 *
 * A plan is the doctor's saved output that a patient later loads. These handlers
 * own the write/read rules: server-generated ids, server-set timestamps
 * (`createdAt` set once, `updatedAt` bumped on every write), validation against
 * the shared dosage bounds (rejecting invalid payloads with a per-field 400 and
 * persisting nothing), and item ordering by the `order` field. Persistence
 * itself is delegated to an injectable {@link PlanStore}, so the production
 * file/SQLite backing and the in-memory test store are interchangeable.
 *
 * The functions are pure over their injected dependencies; the HTTP layer only
 * translates the returned `{ status, body }` into a response.
 */

/** Error code returned when a create/update payload fails validation. */
export const PLAN_VALIDATION_CODE = 'plan_validation_failed';

/** Re-exported for callers building 404 bodies against the same code the share handler uses. */
export { PLAN_NOT_FOUND_CODE };

/**
 * Body returned for a 400 validation failure: the standard {@link ErrorEnvelope}
 * plus the per-field `errors` list so a client can surface a message on each
 * offending control.
 */
export interface ValidationErrorBody extends ErrorEnvelope {
  errors: FieldError[];
}

/** Injectable dependencies for the persistence handlers. */
export interface PlanPersistenceDeps {
  /** Backing store; defaults to a fresh in-memory store. */
  store?: PlanStore;
  /** Exercise catalogue used to validate item `exerciseId`s; defaults to the seed. */
  exercises?: readonly Exercise[];
  /** Clock for server-set timestamps; defaults to `new Date().toISOString()`. */
  now?: () => string;
  /** Id generator for new plans; defaults to a collision-resistant random id. */
  generateId?: () => string;
}

interface ResolvedDeps {
  store: PlanStore;
  knownExerciseIds: ReadonlySet<string>;
  now: () => string;
  generateId: () => string;
}

function defaultGenerateId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `plan-${Date.now().toString(36)}-${rand}`;
}

function resolveDeps(deps: PlanPersistenceDeps): ResolvedDeps {
  const exercises = deps.exercises ?? EXERCISE_CATALOG;
  return {
    store: deps.store ?? new InMemoryPlanStore(),
    knownExerciseIds: new Set(indexExercisesById(exercises).keys()),
    now: deps.now ?? (() => new Date().toISOString()),
    generateId: deps.generateId ?? defaultGenerateId,
  };
}

/** Build the 400 validation body from a list of field errors. */
function validationError(errors: FieldError[]): JsonResponse<ValidationErrorBody> {
  return {
    status: 400,
    body: {
      ...errorEnvelope(PLAN_VALIDATION_CODE, 'Plan payload failed validation'),
      errors,
    },
  };
}

/** Build a 404 body for an unknown plan id. */
function notFound(id: string): JsonResponse<ErrorEnvelope> {
  return {
    status: 404,
    body: errorEnvelope(PLAN_NOT_FOUND_CODE, `Plan "${id}" was not found`),
  };
}

/**
 * Normalise the client's items into stored items: trim the exercise id, coerce
 * the dosage/`order` numbers, and return them sorted by `order` so reads always
 * present the intended sequence regardless of input order.
 */
function normaliseItems(items: StoredPlanItem[]): StoredPlanItem[] {
  return items
    .map((item) => ({
      exerciseId: item.exerciseId.trim(),
      sets: item.sets,
      reps: item.reps,
      holdSeconds: item.holdSeconds,
      restSeconds: item.restSeconds,
      order: item.order,
    }))
    .sort((a, b) => a.order - b.order);
}

/** Trim optional string fields, dropping empty ones so they are omitted. */
function normaliseNotes(notes?: string): string | undefined {
  if (notes == null) return undefined;
  const trimmed = notes.trim();
  return trimmed === '' ? undefined : trimmed;
}

function normaliseSourceTemplateId(id?: string): string | undefined {
  if (id == null) return undefined;
  const trimmed = id.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Handler for `POST /api/plans`.
 *
 * - Valid payload -> 201 with the stored {@link StoredPlan} (server id +
 *   `createdAt`/`updatedAt`, items sorted by `order`).
 * - Invalid payload -> 400 with a per-field {@link ValidationErrorBody};
 *   nothing is persisted.
 */
export function handleCreatePlan(
  input: PlanInput,
  deps: PlanPersistenceDeps = {},
): JsonResponse<StoredPlan> | JsonResponse<ValidationErrorBody> {
  const { store, knownExerciseIds, now, generateId } = resolveDeps(deps);

  const errors = validatePlanInput(input, knownExerciseIds);
  if (errors.length > 0) return validationError(errors);

  const timestamp = now();
  const plan: StoredPlan = {
    id: generateId(),
    patientName: input.patientName.trim(),
    sourceTemplateId: normaliseSourceTemplateId(input.sourceTemplateId),
    notes: normaliseNotes(input.notes),
    items: normaliseItems(input.items),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return { status: 201, body: store.create(plan) };
}

/**
 * Handler for `GET /api/plans/:id`.
 *
 * - Found -> 200 with the stored plan (items in `order`).
 * - Unknown id -> 404 with a standard {@link ErrorEnvelope}.
 */
export function handleGetPlan(
  id: string,
  deps: PlanPersistenceDeps = {},
): JsonResponse<StoredPlan> | JsonResponse<ErrorEnvelope> {
  const { store } = resolveDeps(deps);
  const plan = store.getById(id);
  if (!plan) return notFound(id);
  return { status: 200, body: { ...plan, items: normaliseItems(plan.items) } };
}

/**
 * Handler for `GET /api/plans` and `GET /api/plans?patientName=`.
 *
 * Always 200 with the matching plans (each with items in `order`). A
 * `patientName` filter matches case-insensitively; an omitted/blank filter
 * lists every plan.
 */
export function handleListPlans(
  patientName: string | undefined,
  deps: PlanPersistenceDeps = {},
): JsonResponse<StoredPlan[]> {
  const { store } = resolveDeps(deps);
  const plans = store
    .list(patientName)
    .map((plan) => ({ ...plan, items: normaliseItems(plan.items) }));
  return { status: 200, body: plans };
}

/**
 * Handler for `PUT /api/plans/:id` — a full replace of the plan's mutable fields
 * (patient, source template, notes, items) with re-validation.
 *
 * - Unknown id -> 404 (checked first, before validation).
 * - Invalid payload -> 400 with a per-field {@link ValidationErrorBody};
 *   nothing is persisted.
 * - Valid -> 200 with the updated plan: `createdAt` is preserved and
 *   `updatedAt` is bumped, items re-sorted by `order`.
 */
export function handleUpdatePlan(
  id: string,
  input: PlanInput,
  deps: PlanPersistenceDeps = {},
): JsonResponse<StoredPlan> | JsonResponse<ValidationErrorBody> | JsonResponse<ErrorEnvelope> {
  const { store, knownExerciseIds, now } = resolveDeps(deps);

  const existing = store.getById(id);
  if (!existing) return notFound(id);

  const errors = validatePlanInput(input, knownExerciseIds);
  if (errors.length > 0) return validationError(errors);

  const updated: StoredPlan = {
    id: existing.id,
    patientName: input.patientName.trim(),
    sourceTemplateId: normaliseSourceTemplateId(input.sourceTemplateId),
    notes: normaliseNotes(input.notes),
    items: normaliseItems(input.items),
    createdAt: existing.createdAt,
    updatedAt: now(),
  };

  const stored = store.replace(id, updated);
  // `existing` was resolved above, so replace always succeeds here.
  return { status: 200, body: stored ?? updated };
}
