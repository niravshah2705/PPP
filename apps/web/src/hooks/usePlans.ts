import { useEffect, useState } from 'react';
import { fetchPlans } from '../api/plans';
import { sortPlansByUpdatedAt } from '../lib/planList';
import type { Plan } from '../types/plan';

export type PlansStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface UsePlansResult {
  status: PlansStatus;
  /** Plans sorted newest-first by `updatedAt` (present when status is `ready`). */
  plans: Plan[];
  error?: string;
}

/**
 * Load all plans (GET /api/plans) for the doctor's manage view. Status is
 * discriminated so the page can branch cleanly:
 * - `empty`  — the request succeeded but there are no plans yet.
 * - `ready`  — plans exist; pre-sorted newest-first by `updatedAt`.
 * - `error`  — the load failed.
 */
export function usePlans(): UsePlansResult {
  const [result, setResult] = useState<UsePlansResult>({ status: 'loading', plans: [] });

  useEffect(() => {
    const controller = new AbortController();
    setResult({ status: 'loading', plans: [] });

    fetchPlans(controller.signal)
      .then((plans) => {
        if (controller.signal.aborted) return;
        if (plans.length === 0) {
          setResult({ status: 'empty', plans: [] });
          return;
        }
        setResult({ status: 'ready', plans: sortPlansByUpdatedAt(plans) });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult({
          status: 'error',
          plans: [],
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });

    return () => controller.abort();
  }, []);

  return result;
}
