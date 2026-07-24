import type { StoredPlan } from '../types/storedPlan';

/**
 * Persistence port for stored plans.
 *
 * The handlers depend on this interface rather than a concrete backing, so the
 * production file/SQLite store and the tests' in-memory store are
 * interchangeable. Implementations own durability and identity lookup only;
 * id generation, timestamps, validation, and item ordering live in the handler
 * layer so every backing behaves identically.
 */
export interface PlanStore {
  /** Persist a fully-formed record (id/timestamps already assigned). */
  create(plan: StoredPlan): StoredPlan;
  /** Resolve a plan by id, or `undefined` when none exists. */
  getById(id: string): StoredPlan | undefined;
  /**
   * List stored plans. When `patientName` is provided the match is
   * case-insensitive (trimmed exact match); when omitted, every plan is
   * returned.
   */
  list(patientName?: string): StoredPlan[];
  /**
   * Replace the record at `id` with `plan`. Returns the stored record, or
   * `undefined` when no plan exists at `id` (so the handler can answer 404).
   */
  replace(id: string, plan: StoredPlan): StoredPlan | undefined;
}

/** Deep-clone a plan so stored state can never be mutated through a returned reference. */
function clone(plan: StoredPlan): StoredPlan {
  return {
    ...plan,
    items: plan.items.map((item) => ({ ...item })),
  };
}

/**
 * In-memory {@link PlanStore} — the default backing used by tests and the
 * browser mock. State lives in a `Map` keyed by id. Every value crossing the
 * boundary is cloned so callers can neither observe nor mutate internal state by
 * reference.
 */
export class InMemoryPlanStore implements PlanStore {
  private readonly plans = new Map<string, StoredPlan>();

  constructor(seed: readonly StoredPlan[] = []) {
    for (const plan of seed) this.plans.set(plan.id, clone(plan));
  }

  create(plan: StoredPlan): StoredPlan {
    this.plans.set(plan.id, clone(plan));
    return clone(plan);
  }

  getById(id: string): StoredPlan | undefined {
    const plan = this.plans.get(id);
    return plan ? clone(plan) : undefined;
  }

  list(patientName?: string): StoredPlan[] {
    const all = Array.from(this.plans.values());
    const filtered =
      patientName == null || patientName.trim() === ''
        ? all
        : all.filter(
            (plan) =>
              plan.patientName.trim().toLowerCase() === patientName.trim().toLowerCase(),
          );
    return filtered.map(clone);
  }

  replace(id: string, plan: StoredPlan): StoredPlan | undefined {
    if (!this.plans.has(id)) return undefined;
    this.plans.set(id, clone(plan));
    return clone(plan);
  }
}
