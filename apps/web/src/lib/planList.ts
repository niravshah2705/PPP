import type { Plan } from '../types/plan';
import type { PlanDraft, PlanDraftItem } from '../types/template';

/**
 * Return plans sorted newest-first by `updatedAt` so recent work sits at the
 * top of the manage view. Pure (does not mutate the input). Invalid/unparseable
 * timestamps sort last so one bad record never hides good ones.
 */
export function sortPlansByUpdatedAt(plans: readonly Plan[]): Plan[] {
  return [...plans].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}

function timestamp(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Client-side search over plans by patient name and source template name.
 * Case-insensitive, trims and ignores an empty query (returns the list as-is,
 * preserving order). A plan matches when either field contains the query.
 */
export function filterPlansByQuery(plans: readonly Plan[], query: string): Plan[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...plans];
  return plans.filter((plan) => {
    const patient = plan.patientName.toLowerCase();
    const template = (plan.templateName ?? '').toLowerCase();
    return patient.includes(needle) || template.includes(needle);
  });
}

/**
 * Pick the most recent plan assigned to `patientName`, or null when none match.
 *
 * Backs the patient view's `?patientName=` entry point (NIR-765): the `GET
 * /api/plans?patientName=` list is a best-effort substring match, so this
 * narrows to plans whose patient name matches exactly (trimmed,
 * case-insensitive) and returns the newest by `updatedAt`. An empty/whitespace
 * query never matches, so the caller falls back to a clear empty state rather
 * than silently opening someone else's plan.
 */
export function mostRecentPlanForPatient(
  plans: readonly Plan[],
  patientName: string,
): Plan | null {
  const needle = patientName.trim().toLowerCase();
  if (!needle) return null;
  const matches = plans.filter(
    (plan) => plan.patientName.trim().toLowerCase() === needle,
  );
  if (matches.length === 0) return null;
  return sortPlansByUpdatedAt(matches)[0];
}

/** Deep-copy plan items so a draft never mutates the source plan's items. */
function cloneItems(items: readonly PlanDraftItem[]): PlanDraftItem[] {
  return items.map((item) => ({ ...item }));
}

/**
 * Build a draft that edits an existing plan along the edit path. Carries the
 * plan `id` and patient so saving updates the same plan in place rather than
 * creating a duplicate.
 */
export function planToEditDraft(plan: Plan): PlanDraft {
  return {
    id: plan.id,
    templateId: plan.templateId,
    templateName: plan.templateName,
    name: plan.templateName ?? plan.patientName,
    patientName: plan.patientName,
    items: cloneItems(plan.items),
  };
}

/**
 * Clone a plan into a brand-new draft. Preserves the items and template
 * provenance but drops the plan `id` (so saving creates a new plan) and clears
 * the patient — the doctor must reassign it, avoiding accidental cross-patient
 * reuse.
 */
export function duplicatePlanToDraft(plan: Plan): PlanDraft {
  return {
    templateId: plan.templateId,
    templateName: plan.templateName,
    name: plan.templateName ?? '',
    patientName: undefined,
    items: cloneItems(plan.items),
  };
}
