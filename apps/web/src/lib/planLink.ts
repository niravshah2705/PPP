/** Canonical patient-facing path for starting a plan. Single source of truth. */
export function patientPlanPath(planId: string): string {
  return `/plan/${encodeURIComponent(planId)}`;
}

/**
 * Absolute shareable URL for a plan, resolved against the current origin when
 * available. Falls back to the relative path in non-browser contexts (SSR/tests
 * without a location), so the link is always well-formed.
 */
export function patientPlanShareUrl(planId: string): string {
  const path = patientPlanPath(planId);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  return `${origin}${path}`;
}
