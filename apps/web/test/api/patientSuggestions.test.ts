import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPatientNameSuggestions, PlanLoadError } from '../../src/api/plans';
import type { Plan } from '../../src/types/plan';

function plan(patientName: string): Plan {
  return { id: patientName, patientName, items: [], updatedAt: '2024-01-01T00:00:00Z' };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('fetchPatientNameSuggestions', () => {
  it('queries GET /api/plans?patientName=<query> and returns distinct names', async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL) =>
      Promise.resolve(json([plan('Ada Lovelace'), plan('ada lovelace'), plan('Bob Stone')])),
    );
    vi.stubGlobal('fetch', fetchFn);

    const names = await fetchPatientNameSuggestions('ad');

    expect(names).toEqual(['Ada Lovelace', 'Bob Stone']);
    expect(String(fetchFn.mock.calls[0][0])).toBe('/api/plans?patientName=ad');
  });

  it('trims the query and encodes it into the patientName param', async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL) => Promise.resolve(json([])));
    vi.stubGlobal('fetch', fetchFn);

    await fetchPatientNameSuggestions('  Bob Stone  ');

    expect(String(fetchFn.mock.calls[0][0])).toBe('/api/plans?patientName=Bob+Stone');
  });

  it('defaults to an empty query listing every previously-used patient', async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL) => Promise.resolve(json([plan('Ada')])));
    vi.stubGlobal('fetch', fetchFn);

    const names = await fetchPatientNameSuggestions();

    expect(names).toEqual(['Ada']);
    expect(String(fetchFn.mock.calls[0][0])).toBe('/api/plans?patientName=');
  });

  it('returns an empty list for a malformed (non-array) payload rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ nope: true }))));
    await expect(fetchPatientNameSuggestions('x')).resolves.toEqual([]);
  });

  it('raises PlanLoadError on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json('boom', 500))));
    await expect(fetchPatientNameSuggestions('x')).rejects.toBeInstanceOf(PlanLoadError);
  });

  it('raises PlanLoadError on a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await expect(fetchPatientNameSuggestions('x')).rejects.toBeInstanceOf(PlanLoadError);
  });
});
