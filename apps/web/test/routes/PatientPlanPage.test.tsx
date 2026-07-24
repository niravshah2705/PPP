import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientPlanPage } from '../../src/routes/PatientPlanPage';
import type { SharedPlan } from '../../src/types/sharedPlan';
import type { Plan } from '../../src/types/plan';

const shared: SharedPlan = {
  id: 'plan-ada',
  patientName: 'Ada Lovelace',
  items: [
    {
      exerciseId: 'quad-set',
      sets: 3,
      reps: 10,
      hold: 5,
      rest: 30,
      order: 0,
      exercise: { id: 'quad-set', name: 'Quad set', description: 'Tighten the thigh.' },
    },
  ],
};

const listPlan: Plan = {
  id: 'plan-ada',
  patientName: 'Ada Lovelace',
  templateName: 'Knee rehab',
  items: shared.items.map((i) => ({
    exerciseId: i.exerciseId,
    sets: i.sets,
    reps: i.reps,
    hold: i.hold,
    rest: i.rest,
    order: i.order,
  })),
  updatedAt: '2024-06-01T10:00:00Z',
};

interface RouteStubs {
  share?: (id: string) => Response;
  list?: () => Response;
  sessionsHang?: boolean;
}

function stubApi(stubs: RouteStubs = {}) {
  const fn = vi.fn((url: string) => {
    if (url.includes('/share')) {
      const id = decodeURIComponent(url.replace('/api/plans/', '').replace('/share', ''));
      const res = stubs.share?.(id);
      if (res) return Promise.resolve(res);
      return Promise.reject(new Error(`unexpected share url ${url}`));
    }
    if (url.startsWith('/api/plans?')) {
      const res = stubs.list?.();
      if (res) return Promise.resolve(res);
      return Promise.reject(new Error(`unexpected list url ${url}`));
    }
    if (url.startsWith('/api/sessions')) {
      // Keep the player in its 'checking' phase so the transition is observable
      // without driving the whole session lifecycle (covered elsewhere).
      if (stubs.sessionsHang) return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PatientPlanPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PatientPlanPage — overview', () => {
  it('opening /patient?planId=<id> shows the correct plan overview and a Start button', async () => {
    stubApi({ share: () => new Response(JSON.stringify(shared), { status: 200 }) });
    renderAt('/patient?planId=plan-ada');

    await screen.findByTestId('plan-overview');
    expect(screen.getByTestId('plan-overview-patient')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByText('Quad set')).toBeInTheDocument();
    expect(screen.getByText('3 × 5s hold')).toBeInTheDocument();
    expect(screen.getByTestId('plan-overview-duration')).toBeInTheDocument();
    expect(screen.getByTestId('plan-overview-start')).toBeInTheDocument();
  });

  it('resolves ?patientName= to the patient\'s most recent plan', async () => {
    const fn = stubApi({
      share: () => new Response(JSON.stringify(shared), { status: 200 }),
      list: () => new Response(JSON.stringify([listPlan]), { status: 200 }),
    });
    renderAt('/patient?patientName=Ada%20Lovelace');

    await screen.findByTestId('plan-overview');
    expect(screen.getByTestId('plan-overview-patient')).toHaveTextContent('Ada Lovelace');
    // resolved via the list endpoint, then loaded the share payload
    expect(fn.mock.calls.some(([u]) => (u as string).startsWith('/api/plans?patientName='))).toBe(true);
    expect(fn.mock.calls.some(([u]) => (u as string).includes('/api/plans/plan-ada/share'))).toBe(true);
  });

  it('clicking Start hands off to the session player', async () => {
    stubApi({
      share: () => new Response(JSON.stringify(shared), { status: 200 }),
      sessionsHang: true,
    });
    renderAt('/patient?planId=plan-ada');

    await screen.findByTestId('plan-overview-start');
    await userEvent.click(screen.getByTestId('plan-overview-start'));

    // The overview is replaced by the player shell.
    await screen.findByTestId('patient-plan');
    expect(screen.queryByTestId('plan-overview')).toBeNull();
  });
});

describe('PatientPlanPage — empty states (no crash)', () => {
  it('shows a clear empty state when neither planId nor patientName is present', async () => {
    stubApi();
    renderAt('/patient');
    expect(await screen.findByText(/no plan selected/i)).toBeInTheDocument();
  });

  it('shows a not-found empty state for an unknown planId', async () => {
    stubApi({ share: () => new Response('missing', { status: 404 }) });
    renderAt('/patient?planId=nope');
    expect(await screen.findByText(/plan not found/i)).toBeInTheDocument();
  });

  it('shows a not-found empty state when a patientName resolves to no plan', async () => {
    stubApi({ list: () => new Response(JSON.stringify([]), { status: 200 }) });
    renderAt('/patient?patientName=Nobody');
    expect(await screen.findByText(/plan not found/i)).toBeInTheDocument();
  });

  it('shows an error empty state on a transport/server failure', async () => {
    stubApi({ share: () => new Response('boom', { status: 500 }) });
    renderAt('/patient?planId=plan-ada');
    expect(await screen.findByText(/couldn.t load your plan/i)).toBeInTheDocument();
  });
});
