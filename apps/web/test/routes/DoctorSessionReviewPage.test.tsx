import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoctorSessionReviewPage } from '../../src/routes/DoctorSessionReviewPage';
import type { PatientProgress, Session } from '../../src/types/session';

function renderAt(planId: string) {
  return render(
    <MemoryRouter initialEntries={[`/doctor/sessions/${planId}`]}>
      <Routes>
        <Route path="/doctor/sessions/:planId" element={<DoctorSessionReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Route fetch by URL to the sessions/progress endpoints. */
function stubApi(sessions: Session[] | Error, progress: PatientProgress) {
  const fn = vi.fn((url: string) => {
    if (url.startsWith('/api/sessions')) {
      if (sessions instanceof Error) return Promise.reject(sessions);
      return Promise.resolve(new Response(JSON.stringify(sessions), { status: 200 }));
    }
    if (url.startsWith('/api/progress')) {
      return Promise.resolve(new Response(JSON.stringify(progress), { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const twoSessions: Session[] = [
  {
    id: 'old',
    planId: 'p1',
    date: '2024-01-01T10:00:00Z',
    completionPct: 50,
    avgForm: 60,
    exercises: [
      { exerciseId: 'a', name: 'Squat', targetReps: 10, completedReps: 5, avgForm: 60, maxRom: 90, skipped: false },
    ],
  },
  {
    id: 'new',
    planId: 'p1',
    date: '2024-03-01T10:00:00Z',
    completionPct: 90,
    avgForm: 88,
    exercises: [
      { exerciseId: 'a', name: 'Squat', targetReps: 10, completedReps: 10, avgForm: 88, maxRom: 120, skipped: false },
    ],
  },
];

const progress: PatientProgress = {
  planId: 'p1',
  series: [
    { date: '2024-01-01', reps: 5, form: 60, rom: 90 },
    { date: '2024-03-01', reps: 10, form: 88, rom: 120 },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DoctorSessionReviewPage', () => {
  it('lists sessions newest-first and defaults the drill-down to the newest', async () => {
    stubApi(twoSessions, progress);
    renderAt('p1');

    await waitFor(() => expect(screen.getByTestId('session-list')).toBeInTheDocument());

    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveAttribute('data-testid', 'session-row-new');
    expect(rows[1]).toHaveAttribute('data-testid', 'session-row-old');

    // Detail defaults to the newest session's persisted numbers.
    expect(screen.getByTestId('detail-completion')).toHaveTextContent('90%');
    expect(screen.getByTestId('detail-avg-form')).toHaveTextContent('88');
    // Trend chart rendered from the progress endpoint.
    expect(screen.getByTestId('trend-series-reps')).toBeInTheDocument();
  });

  it('drills into a selected session showing completed vs target', async () => {
    stubApi(twoSessions, progress);
    renderAt('p1');
    await waitFor(() => expect(screen.getByTestId('session-list')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('session-row-old'));
    const detail = within(screen.getByTestId('session-detail'));
    expect(detail.getByTestId('exercise-reps-a')).toHaveTextContent('5 / 10');
    expect(detail.getByTestId('exercise-reps-a')).toHaveTextContent('Under target');
  });

  it('shows the empty state with the plan link when there are no sessions', async () => {
    stubApi([], { planId: 'p1', series: [] });
    renderAt('p1');
    await waitFor(() => expect(screen.getByTestId('empty-sessions')).toBeInTheDocument());
    expect(screen.getByTestId('empty-plan-link').getAttribute('href')).toContain('/plan/p1');
  });

  it('shows an error card when the sessions request fails', async () => {
    stubApi(new Error('offline'), { planId: 'p1', series: [] });
    renderAt('p1');
    await waitFor(() => expect(screen.getByTestId('inline-error-card')).toBeInTheDocument());
  });

  it('still renders sessions when the trend chart data is empty', async () => {
    stubApi(twoSessions, { planId: 'p1', series: [] });
    renderAt('p1');
    await waitFor(() => expect(screen.getByTestId('session-list')).toBeInTheDocument());
    expect(screen.getByTestId('trend-empty')).toBeInTheDocument();
  });
});
