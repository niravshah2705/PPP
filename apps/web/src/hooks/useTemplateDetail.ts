import { useCallback, useEffect, useState } from 'react';
import type { TemplateDetail } from '../types/template';
import { TemplateNotFoundError, getTemplate } from '../api/templates';

export type TemplateDetailStatus = 'loading' | 'ready' | 'not-found' | 'error';

export interface UseTemplateDetailResult {
  status: TemplateDetailStatus;
  detail?: TemplateDetail;
  error?: string;
  /** Re-run the fetch for the current id — wired to the error state's retry. */
  retry: () => void;
}

/**
 * Load a template expanded for the preview panel via `GET /api/templates/:id`,
 * mapping failures to a discriminated status. Passing `undefined` leaves the
 * hook idle in the `not-found` state (nothing selected yet). `retry` re-issues
 * the request so the error state can offer a retry without a full remount.
 */
export function useTemplateDetail(id: string | undefined): UseTemplateDetailResult {
  const [result, setResult] = useState<
    Pick<UseTemplateDetailResult, 'status' | 'detail' | 'error'>
  >({ status: id ? 'loading' : 'not-found' });
  // Bumped by `retry` to re-run the load effect for the same id.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!id) {
      setResult({ status: 'not-found' });
      return;
    }

    const controller = new AbortController();
    setResult({ status: 'loading' });

    getTemplate(id, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setResult({ status: 'ready', detail });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof TemplateNotFoundError) {
          setResult({ status: 'not-found' });
        } else {
          setResult({
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      });

    return () => controller.abort();
  }, [id, attempt]);

  return { ...result, retry };
}
