import type { Plan } from '../types/plan';

/** Thrown for transport/server errors while loading plans. */
export class PlanLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanLoadError';
  }
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
