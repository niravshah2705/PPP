import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PlanConflictError,
  PlanLoadError,
  PlanNotFoundError,
  PlanValidationError,
  fetchPlan,
  fetchPlans,
  fetchSharedPlan,
  savePlan,
} from '../../src/api/plans';
import type { PlanDraft } from '../../src/types/template';

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

const validDraft: PlanDraft = {
  templateId: 't1',
  templateName: 'Knee rehab',
  name: 'Knee rehab',
  patientName: 'Ada Lovelace',
  items: [{ exerciseId: 'a', sets: 3, reps: 10, hold: 0, rest: 30 }],
};

describe('savePlan', () => {
  it('POSTs a new draft to /api/plans and returns the persisted plan', async () => {
    const created = { ...onePlan[0], patientName: 'Ada Lovelace' };
    const fn = mockFetch(() => new Response(JSON.stringify(created), { status: 201 }));

    const plan = await savePlan(validDraft);

    expect(fn).toHaveBeenCalledWith('/api/plans', expect.objectContaining({ method: 'POST' }));
    const call = fn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.patientName).toBe('Ada Lovelace');
    expect(plan.id).toBe('p1');
  });

  it('PUTs to /api/plans/:id when the draft carries an id', async () => {
    const fn = mockFetch(() => new Response(JSON.stringify(onePlan[0]), { status: 200 }));
    await savePlan({ ...validDraft, id: 'p1' });
    expect(fn).toHaveBeenCalledWith('/api/plans/p1', expect.objectContaining({ method: 'PUT' }));
  });

  it('throws PlanValidationError locally without sending an invalid draft', async () => {
    const fn = mockFetch(() => new Response('{}', { status: 201 }));
    await expect(savePlan({ ...validDraft, patientName: '   ' })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('surfaces server field errors on HTTP 422', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ errors: [{ field: 'items[0].reps', message: 'nope' }] }), {
          status: 422,
        }),
    );
    await expect(savePlan(validDraft)).rejects.toMatchObject({
      name: 'PlanValidationError',
      fieldErrors: { 'items[0].reps': 'nope' },
    });
  });

  it('throws PlanConflictError on HTTP 409 (concurrent edit) without mutating the draft', async () => {
    const fn = mockFetch(() => new Response('conflict', { status: 409 }));
    await expect(savePlan({ ...validDraft, id: 'p1' })).rejects.toBeInstanceOf(PlanConflictError);
    // A conflict is a PUT rejection — nothing else was retried automatically.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws PlanNotFoundError on HTTP 404 when updating a missing plan', async () => {
    mockFetch(() => new Response('nope', { status: 404 }));
    await expect(savePlan({ ...validDraft, id: 'gone' })).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('wraps network failures as PlanLoadError (draft kept for retry)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(savePlan(validDraft)).rejects.toBeInstanceOf(PlanLoadError);
  });

  it('throws PlanLoadError on other non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(savePlan(validDraft)).rejects.toBeInstanceOf(PlanLoadError);
  });
});

describe('fetchPlan (share endpoint)', () => {
  it('GETs /api/plans/:id and returns the plan', async () => {
    const fn = mockFetch(() => new Response(JSON.stringify(onePlan[0]), { status: 200 }));
    const plan = await fetchPlan('p1');
    expect(fn).toHaveBeenCalledWith('/api/plans/p1', expect.anything());
    expect(plan.patientName).toBe('Ada Lovelace');
  });

  it('throws PlanNotFoundError on HTTP 404', async () => {
    mockFetch(() => new Response('nope', { status: 404 }));
    await expect(fetchPlan('missing')).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('throws PlanLoadError on other non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(fetchPlan('p1')).rejects.toBeInstanceOf(PlanLoadError);
  });
});

const sharedPlan = {
  id: 'p1',
  patientName: 'Ada Lovelace',
  items: [
    {
      exerciseId: 'ex-1',
      sets: 3,
      reps: 10,
      hold: 0,
      rest: 30,
      order: 0,
      exercise: { id: 'ex-1', name: 'Exercise One', demoMediaRef: 'media/ex-1.mp4' },
    },
  ],
};

describe('fetchSharedPlan (GET /api/plans/:id/share)', () => {
  it('GETs /api/plans/:id/share and returns the patient-facing payload', async () => {
    const fn = mockFetch(() => new Response(JSON.stringify(sharedPlan), { status: 200 }));
    const plan = await fetchSharedPlan('p1');
    expect(fn).toHaveBeenCalledWith('/api/plans/p1/share', expect.anything());
    expect(plan.patientName).toBe('Ada Lovelace');
    expect(plan.items[0].exercise.name).toBe('Exercise One');
  });

  it('encodes the id in the path', async () => {
    const fn = mockFetch(() => new Response(JSON.stringify(sharedPlan), { status: 200 }));
    await fetchSharedPlan('a b/c');
    expect(fn).toHaveBeenCalledWith('/api/plans/a%20b%2Fc/share', expect.anything());
  });

  it('throws PlanNotFoundError on HTTP 404', async () => {
    mockFetch(() => new Response(JSON.stringify({ error: { code: 'plan_not_found' } }), { status: 404 }));
    await expect(fetchSharedPlan('missing')).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('throws PlanLoadError on other non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(fetchSharedPlan('p1')).rejects.toBeInstanceOf(PlanLoadError);
  });

  it('throws PlanLoadError on a malformed payload (item missing expanded exercise)', async () => {
    const bad = { id: 'p1', patientName: 'Ada', items: [{ exerciseId: 'ex-1', sets: 1, reps: 1, hold: 0, rest: 0 }] };
    mockFetch(() => new Response(JSON.stringify(bad), { status: 200 }));
    await expect(fetchSharedPlan('p1')).rejects.toBeInstanceOf(PlanLoadError);
  });

  it('wraps network errors as PlanLoadError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(fetchSharedPlan('p1')).rejects.toBeInstanceOf(PlanLoadError);
  });
});
