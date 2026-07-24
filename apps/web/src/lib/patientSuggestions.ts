import type { Plan } from '../types/plan';

/** Trimmed, non-empty patient name or `null` for blank/whitespace-only input. */
export function normalizePatientName(name: string | undefined | null): string | null {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reduce a list of plans to the distinct patient names that back a typeahead of
 * previously-used patients. Names are trimmed; blanks are dropped; duplicates
 * are collapsed case-insensitively (the first-seen casing wins so display stays
 * natural); the result is sorted alphabetically (case-insensitive) so the
 * suggestion order is stable regardless of plan ordering. Pure: the input is
 * never mutated.
 */
export function distinctPatientNames(plans: readonly Plan[]): string[] {
  const seen = new Map<string, string>();
  for (const plan of plans) {
    const name = normalizePatientName(plan?.patientName);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

/**
 * Filter distinct patient names by a case-insensitive substring query. An empty
 * query returns every name (so focusing the field surfaces the full history of
 * previously-used patients). A name that exactly equals the query is dropped so
 * the box doesn't suggest what the doctor has already fully typed. Optionally
 * capped to `limit` entries. Pure.
 */
export function filterPatientSuggestions(
  names: readonly string[],
  query: string,
  limit = 8,
): string[] {
  const q = query.trim().toLowerCase();
  const matches = names.filter((name) => {
    const lower = name.toLowerCase();
    if (lower === q) return false;
    return q === '' || lower.includes(q);
  });
  return limit > 0 ? matches.slice(0, limit) : matches;
}
