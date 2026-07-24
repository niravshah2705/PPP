import { useEffect, useState } from 'react';
import { PlanNotFoundError, fetchPlan } from '../api/plans';
import type { Plan } from '../types/plan';

export type PlanStatus = 'loading' | 'ready' | 'not-found' | 'error';

export interface UsePlanResult {
  status: PlanStatus;
  plan?: Plan;
  error?: string;
}

/**
 * Load a single plan by id (`GET /api/plans/:id`) — the same lookup the
 * patient's shareable deep link (`/patient?planId=...`) resolves through, so the
 * patient player runs against the doctor's persisted plan. Failures map to a
 * discriminated status so the page can branch cleanly.
 */
export function usePlan(id: string | undefined): UsePlanResult {
  const [result, setResult] = useState<UsePlanResult>({ status: 'loading' });

  useEffect(() => {
    if (!id) {
      setResult({ status: 'not-found' });
      return;
    }

    const controller = new AbortController();
    setResult({ status: 'loading' });

    fetchPlan(id, controller.signal)
      .then((plan) => {
        if (controller.signal.aborted) return;
        setResult({ status: 'ready', plan });
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
  }, [id]);

  return result;
}
