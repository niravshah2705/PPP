import { useEffect, useState } from 'react';
import { fetchPatientNameSuggestions } from '../api/plans';

/**
 * Load the distinct, previously-used patient names that back the selector's
 * typeahead, narrowed server-side by `query` via `GET /api/plans?patientName=`.
 *
 * The query is debounced so typing doesn't fire a request per keystroke, and
 * each request is abortable so a stale response never clobbers a newer one.
 * Suggestions are best-effort: any failure resolves to an empty list rather than
 * surfacing an error, since they only assist entry and never gate it.
 */
export function usePatientSuggestions(query: string, debounceMs = 150): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchPatientNameSuggestions(query, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setNames(result);
        })
        .catch(() => {
          if (!controller.signal.aborted) setNames([]);
        });
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, debounceMs]);

  return names;
}
