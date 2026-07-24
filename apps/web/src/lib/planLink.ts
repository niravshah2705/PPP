/**
 * Canonical patient-facing route for opening a plan — the single source of
 * truth every "share with patient" surface (save confirmation, plan list copy,
 * empty-session prompt) resolves through, so the doctor and patient views always
 * connect on the same persisted plan. The plan id travels as a `planId` query
 * param (`/patient?planId=...`), which is exactly how the patient view reads it.
 */
export function patientPlanPath(planId: string): string {
  return `/patient?planId=${encodeURIComponent(planId)}`;
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
