import type { Plan } from '../types/plan';
import type { SharedPlan, SharedPlanItem } from '../types/sharedPlan';
import type { PlanDraft } from '../types/template';
import {
  errorsByField,
  type FieldError,
} from '../lib/templateValidation';
import { validatePlanForSave } from '../lib/planDraft';
import { distinctPatientNames } from '../lib/patientSuggestions';

/** Thrown for transport/server errors while loading plans. */
export class PlanLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanLoadError';
  }
}

/** Thrown when a plan id does not resolve to a known plan (HTTP 404). */
export class PlanNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Plan "${id}" was not found`);
    this.name = 'PlanNotFoundError';
  }
}

/**
 * Thrown when a save is rejected because the plan changed underneath us
 * (HTTP 409). The draft is never mutated, so the builder can keep it intact and
 * offer a retry.
 */
export class PlanConflictError extends Error {
  constructor(message = 'This plan was changed elsewhere. Reload or retry to save.') {
    super(message);
    this.name = 'PlanConflictError';
  }
}

/**
 * Thrown when a plan draft fails validation — either locally before the request
 * or by the server (HTTP 422), which mirrors the same dosage rules. Carries the
 * field-keyed errors so the builder can surface them on the correct controls.
 */
export class PlanValidationError extends Error {
  public readonly fieldErrors: Record<string, string>;

  constructor(public readonly errors: FieldError[]) {
    super('Plan failed validation');
    this.name = 'PlanValidationError';
    this.fieldErrors = errorsByField(errors);
  }
}

async function parseFieldErrors(response: Response): Promise<FieldError[]> {
  try {
    const body = (await response.json()) as { errors?: FieldError[] };
    if (Array.isArray(body?.errors)) return body.errors;
  } catch {
    // fall through to a generic error below
  }
  return [{ field: '', message: `Validation failed (HTTP ${response.status})` }];
}

function assertPlan(data: unknown): Plan {
  const p = data as Plan;
  if (
    !p ||
    typeof p.id !== 'string' ||
    typeof p.patientName !== 'string' ||
    typeof p.updatedAt !== 'string' ||
    !Array.isArray(p.items)
  ) {
    throw new PlanLoadError('Malformed plan payload');
  }
  return p;
}

function assertSharedPlan(data: unknown): SharedPlan {
  const p = data as SharedPlan;
  if (
    !p ||
    typeof p.id !== 'string' ||
    typeof p.patientName !== 'string' ||
    !Array.isArray(p.items) ||
    !p.items.every(
      (item: SharedPlanItem) =>
        item &&
        typeof item.exerciseId === 'string' &&
        !!item.exercise &&
        typeof item.exercise.id === 'string',
    )
  ) {
    throw new PlanLoadError('Malformed shared plan payload');
  }
  return p;
}

/**
 * List all plans via `GET /api/plans` — the source for the doctor's manage
 * view. Returns the raw list (the caller sorts/searches and renders the empty
 * state). Non-2xx / network failure / malformed payload -> {@link PlanLoadError}.
 */
export async function fetchPlans(signal?: AbortSignal): Promise<Plan[]> {
  let response: Response;
  try {
    response = await fetch('/api/plans', {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new PlanLoadError(
      err instanceof Error ? err.message : 'Network error while loading plans',
    );
  }

  if (!response.ok) {
    throw new PlanLoadError(`Failed to load plans (HTTP ${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new PlanLoadError('Malformed plans payload');
  }
  return data.map(assertPlan);
}

/**
 * Persist a plan draft. A draft without an `id` is created via
 * `POST /api/plans`; one carrying an `id` (opened along the edit path) is
 * updated in place via `PUT /api/plans/:id`, so re-saving an already-loaded plan
 * never creates a duplicate — the server keeps `createdAt` and bumps `updatedAt`.
 *
 * The draft is validated client-side first — the shared plan rules plus a
 * required patient — so nothing invalid is ever sent or persisted and errors
 * surface on the right controls without a round trip. The server mirrors the
 * same rules and answers 422 with field errors, surfaced as
 * {@link PlanValidationError}. A concurrent-edit rejection (409) becomes a
 * {@link PlanConflictError}; a transport failure becomes a {@link PlanLoadError}.
 * Neither mutates the draft, so the builder can keep it intact and offer a retry.
 * On success the persisted {@link Plan} (with a server id and `updatedAt`) is
 * returned so the builder can show the shareable patient link.
 */
export async function savePlan(
  draft: PlanDraft,
  knownExerciseIds?: ReadonlySet<string>,
): Promise<Plan> {
  const localErrors = validatePlanForSave(draft, knownExerciseIds);
  if (localErrors.length > 0) {
    throw new PlanValidationError(localErrors);
  }

  const editing = typeof draft.id === 'string' && draft.id.length > 0;
  const url = editing ? `/api/plans/${encodeURIComponent(draft.id!)}` : '/api/plans';

  let response: Response;
  try {
    response = await fetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(draft),
    });
  } catch (err) {
    throw new PlanLoadError(
      err instanceof Error ? err.message : 'Network error while saving plan',
    );
  }

  if (response.status === 422) {
    throw new PlanValidationError(await parseFieldErrors(response));
  }
  if (response.status === 404) {
    throw new PlanNotFoundError(draft.id ?? '');
  }
  if (response.status === 409) {
    throw new PlanConflictError();
  }
  if (!response.ok) {
    throw new PlanLoadError(`Failed to save plan (HTTP ${response.status})`);
  }

  return assertPlan(await response.json());
}

/**
 * Resolve a single persisted plan via `GET /api/plans/:id` — the full stored
 * record (used, e.g., to confirm a saved plan resolves after the doctor save
 * flow). The patient deep link resolves through {@link fetchSharedPlan} instead,
 * which returns the trimmed patient-facing payload.
 *
 * - 404 -> {@link PlanNotFoundError}.
 * - other non-2xx / network failure / malformed payload -> {@link PlanLoadError}.
 */
export async function fetchPlan(id: string, signal?: AbortSignal): Promise<Plan> {
  const encoded = encodeURIComponent(id);
  let response: Response;
  try {
    response = await fetch(`/api/plans/${encoded}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new PlanLoadError(
      err instanceof Error ? err.message : 'Network error while loading plan',
    );
  }

  if (response.status === 404) {
    throw new PlanNotFoundError(id);
  }
  if (!response.ok) {
    throw new PlanLoadError(`Failed to load plan (HTTP ${response.status})`);
  }

  return assertPlan(await response.json());
}

/**
 * Resolve a plan's patient-facing payload via `GET /api/plans/:id/share` — the
 * endpoint the shareable deep link (`/patient?planId=...`) resolves through.
 *
 * The payload is trimmed to a {@link SharedPlan}: editing-only/internal fields
 * stripped and each item's exercise expanded inline, so the patient view renders
 * the plan overview and runs the session purely from this response without any
 * further calls.
 *
 * - 404 -> {@link PlanNotFoundError} (surfaced by the patient empty state).
 * - other non-2xx / network failure / malformed payload -> {@link PlanLoadError}.
 */
export async function fetchSharedPlan(
  id: string,
  signal?: AbortSignal,
): Promise<SharedPlan> {
  const encoded = encodeURIComponent(id);
  let response: Response;
  try {
    response = await fetch(`/api/plans/${encoded}/share`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new PlanLoadError(
      err instanceof Error ? err.message : 'Network error while loading shared plan',
    );
  }

  if (response.status === 404) {
    throw new PlanNotFoundError(id);
  }
  if (!response.ok) {
    throw new PlanLoadError(`Failed to load shared plan (HTTP ${response.status})`);
  }

  return assertSharedPlan(await response.json());
}

/**
 * Fetch the distinct patient names already used on plans, to back the patient
 * selector's typeahead. Sourced from `GET /api/plans?patientName=<query>`: the
 * server narrows by the (prefix/substring) query and this collapses the
 * returned plans to distinct, trimmed names (see {@link distinctPatientNames}).
 * An empty query lists every previously-used patient so focusing the field
 * surfaces the full history.
 *
 * Suggestions are a best-effort convenience, never a blocker: a malformed
 * (non-array) payload yields an empty list rather than an error. A non-2xx
 * response or transport failure raises {@link PlanLoadError} so the caller can
 * decide (the selector hook simply falls back to no suggestions).
 */
export async function fetchPatientNameSuggestions(
  query = '',
  signal?: AbortSignal,
): Promise<string[]> {
  const params = new URLSearchParams({ patientName: query.trim() });
  let response: Response;
  try {
    response = await fetch(`/api/plans?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new PlanLoadError(
      err instanceof Error ? err.message : 'Network error while loading patient suggestions',
    );
  }

  if (!response.ok) {
    throw new PlanLoadError(`Failed to load patient suggestions (HTTP ${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return distinctPatientNames(data as Plan[]);
}
