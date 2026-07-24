import { useEffect, useState } from 'react';
import {
  PlanNotFoundError,
  fetchMostRecentPlanIdForPatient,
  fetchSharedPlan,
} from '../api/plans';
import type { SharedPlan } from '../types/sharedPlan';

export type PatientPlanStatus =
  | 'no-selection'
  | 'loading'
  | 'ready'
  | 'not-found'
  | 'error';

export interface UsePatientPlanParams {
  /** `planId` query param — the canonical shareable deep-link key. */
  planId?: string;
  /** `patientName` query param — resolved to the patient's most recent plan. */
  patientName?: string;
}

export interface UsePatientPlanResult {
  status: PatientPlanStatus;
  plan?: SharedPlan;
  error?: string;
}

/**
 * Resolve the patient-facing plan for the `/patient` entry point (NIR-765).
 *
 * The view can be opened two ways, in priority order:
 * - `?planId=<id>` — loads that plan's share payload directly
 *   (`GET /api/plans/:id/share`).
 * - `?patientName=<name>` — resolves the patient's **most recent** plan
 *   (`GET /api/plans?patientName=`), then loads its share payload.
 *
 * Neither identifier → `no-selection`; an unknown id or a patient with no plan →
 * `not-found`; any transport/parse failure → `error`. Every failure maps to a
 * discrete status so the page renders a friendly empty state instead of
 * crashing on a missing/invalid plan.
 */
export function usePatientPlan({
  planId,
  patientName,
}: UsePatientPlanParams): UsePatientPlanResult {
  const [result, setResult] = useState<UsePatientPlanResult>({ status: 'loading' });

  const id = planId?.trim() ? planId.trim() : undefined;
  const name = patientName?.trim() ? patientName.trim() : undefined;

  useEffect(() => {
    if (!id && !name) {
      setResult({ status: 'no-selection' });
      return;
    }

    const controller = new AbortController();
    setResult({ status: 'loading' });

    resolvePlanId(id, name, controller.signal)
      .then((resolvedId) => {
        if (controller.signal.aborted) return undefined;
        if (!resolvedId) {
          setResult({ status: 'not-found' });
          return undefined;
        }
        return fetchSharedPlan(resolvedId, controller.signal).then((plan) => {
          if (controller.signal.aborted) return;
          setResult({ status: 'ready', plan });
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof PlanNotFoundError) {
          setResult({ status: 'not-found' });
        } else {
          setResult({
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      });

    return () => controller.abort();
  }, [id, name]);

  return result;
}

/** A direct `planId` wins; otherwise resolve the patient's most recent plan. */
async function resolvePlanId(
  id: string | undefined,
  name: string | undefined,
  signal: AbortSignal,
): Promise<string | null> {
  if (id) return id;
  if (name) return fetchMostRecentPlanIdForPatient(name, signal);
  return null;
}
