import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanLoadError, fetchPlans } from '../../src/api/plans';

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(impl(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const onePlan = [
  {
    id: 'p1',
    patientName: 'Ada Lovelace',
    templateId: 't1',
    templateName: 'Knee rehab',
    items: [{ exerciseId: 'a', sets: 3, reps: 10, hold: 0, rest: 30 }],
    updatedAt: '2024-03-01T10:00:00Z',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPlans', () => {
  it('calls GET /api/plans and returns the list', async () => {
    const fn = mockFetch(() => new Response(JSON.stringify(onePlan), { status: 200 }));
    const plans = await fetchPlans();
    expect(fn).toHaveBeenCalledWith('/api/plans', expect.anything());
    expect(plans).toHaveLength(1);
    expect(plans[0].patientName).toBe('Ada Lovelace');
  });

  it('returns an empty array as-is (empty state is a caller concern)', async () => {
    mockFetch(() => new Response(JSON.stringify([]), { status: 200 }));
    await expect(fetchPlans()).resolves.toEqual([]);
  });

  it('throws PlanLoadError on non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(fetchPlans()).rejects.toBeInstanceOf(PlanLoadError);
  });

  it('throws PlanLoadError on a non-array payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(fetchPlans()).rejects.toBeInstanceOf(PlanLoadError);
  });

  it('throws PlanLoadError on a malformed plan record', async () => {
    mockFetch(() => new Response(JSON.stringify([{ id: 'p1' }]), { status: 200 }));
    await expect(fetchPlans()).rejects.toBeInstanceOf(PlanLoadError);
  });

  it('wraps network errors as PlanLoadError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(fetchPlans()).rejects.toBeInstanceOf(PlanLoadError);
  });
});
