import type { Plan } from '../types/plan';
import type { PlanDraft } from '../types/template';
import {
  errorsByField,
  type FieldError,
} from '../lib/templateValidation';
import { validatePlanForSave } from '../lib/planDraft';

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
 * updated in place via `PUT /api/plans/:id`.
 *
 * The draft is validated client-side first — the shared plan rules plus a
 * required patient — so nothing invalid is ever sent or persisted and errors
 * surface on the right controls without a round trip. The server mirrors the
 * same rules and answers 422 with field errors, surfaced as
 * {@link PlanValidationError}. On success the persisted {@link Plan} (with a
 * server id and `updatedAt`) is returned so the builder can show the shareable
 * patient link.
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
  if (!response.ok) {
    throw new PlanLoadError(`Failed to save plan (HTTP ${response.status})`);
  }

  return assertPlan(await response.json());
}

/**
 * Resolve a single plan via the share endpoint `GET /api/plans/:id` — the same
 * lookup a patient's shareable deep link (`/plan/:id`) resolves through, so the
 * doctor builder and the patient view connect on one persisted record.
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
