import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientPlanPlayer } from '../../src/components/PatientPlanPlayer';
import type { Plan } from '../../src/types/plan';
import type { Session } from '../../src/types/session';
import type { RecorderTransport } from '../../src/lib/sessionRecorder';
import type { TrackedExerciseResult } from '../../src/lib/sessionSequencer';

const plan: Plan = {
  id: 'plan-1',
  patientName: 'Jamie',
  updatedAt: '2024-01-01T00:00:00.000Z',
  items: [
    { exerciseId: 'a', sets: 1, reps: 2, hold: 0, rest: 0 },
    { exerciseId: 'b', sets: 1, reps: 2, hold: 0, rest: 0 },
  ],
};

/** Drop the player into manual mode so we can drive reps by clicking. */
function stubNoCamera() {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(() => Promise.reject({ name: 'NotAllowedError' })) },
  });
}

function fresh(over: Partial<Session> = {}): Session {
  return {
    id: 'sess-new',
    planId: 'plan-1',
    patientName: 'Jamie',
    date: '2024-05-01T00:00:00.000Z',
    status: 'in_progress',
    completionPct: 0,
    avgForm: null,
    exercises: [],
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PatientPlanPlayer — start + resume', () => {
  it('offers to start when there is no in-progress session, and Start creates one tied to the plan/patient', async () => {
    stubNoCamera();
    const startSession = vi.fn(() => Promise.resolve(fresh({ id: 'sess-1' })));
    render(
      <PatientPlanPlayer
        plan={plan}
        loadSessions={() => Promise.resolve([])}
        startSession={startSession}
        transport={{ patch: vi.fn(() => Promise.resolve()), finalize: vi.fn(() => Promise.resolve()) }}
        recorderDebounceMs={0}
      />,
    );

    await screen.findByTestId('start-panel');
    await userEvent.click(screen.getByTestId('start-session-button'));

    expect(startSession).toHaveBeenCalledWith({ planId: 'plan-1', patientName: 'Jamie' });
    await screen.findByTestId('active-session');
  });

  it('surfaces a resume prompt when a session was left in progress', async () => {
    stubNoCamera();
    const startSession = vi.fn(() => Promise.resolve(fresh({ id: 'sess-2' })));
    render(
      <PatientPlanPlayer
        plan={plan}
        loadSessions={() => Promise.resolve([fresh({ id: 'open', status: 'in_progress' })])}
        startSession={startSession}
        transport={{ patch: vi.fn(() => Promise.resolve()), finalize: vi.fn(() => Promise.resolve()) }}
        recorderDebounceMs={0}
      />,
    );

    await screen.findByTestId('resume-prompt');
    await userEvent.click(screen.getByTestId('resume-button'));
    // Resuming reuses the existing session — no new session is created.
    expect(startSession).not.toHaveBeenCalled();
    await screen.findByTestId('active-session');
  });

  it('renders a friendly message for a plan with no exercises', async () => {
    stubNoCamera();
    render(
      <PatientPlanPlayer
        plan={{ ...plan, items: [] }}
        loadSessions={() => Promise.resolve([])}
      />,
    );
    expect(await screen.findByText(/no exercises/i)).toBeInTheDocument();
  });
});

describe('PatientPlanPlayer — recording + finalise', () => {
  it('PATCHes each exercise as it completes and finalises when the plan is done', async () => {
    stubNoCamera();
    const patch = vi.fn(() => Promise.resolve());
    const finalize = vi.fn(() => Promise.resolve());
    const transport: RecorderTransport = { patch, finalize };

    render(
      <PatientPlanPlayer
        plan={plan}
        loadSessions={() => Promise.resolve([])}
        startSession={() => Promise.resolve(fresh({ id: 'sess-1' }))}
        transport={transport}
        recorderDebounceMs={0}
      />,
    );

    await screen.findByTestId('start-panel');
    await userEvent.click(screen.getByTestId('start-session-button'));
    await screen.findByTestId('active-session');

    const countRep = () => screen.getByTestId('manual-rep-button');
    // Exercise a → 2 reps hits target and auto-advances to b.
    await userEvent.click(countRep());
    await userEvent.click(countRep());
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        expect.objectContaining({ exerciseId: 'a', completedReps: 2 }),
      ),
    );

    // Exercise b → completes the plan.
    await userEvent.click(countRep());
    await userEvent.click(countRep());

    await screen.findByTestId('session-complete');
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        expect.objectContaining({ exerciseId: 'b', completedReps: 2 }),
      ),
    );
    await waitFor(() => expect(finalize).toHaveBeenCalledTimes(1));
    await screen.findByTestId('finalized');
  });

  it('retries a failed PATCH on the next transition without losing buffered results', async () => {
    stubNoCamera();
    const patch = vi
      .fn<(result: TrackedExerciseResult) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline')) // exercise a's first PATCH fails
      .mockResolvedValue();
    const finalize = vi.fn(() => Promise.resolve());
    const transport: RecorderTransport = { patch, finalize };

    render(
      <PatientPlanPlayer
        plan={plan}
        loadSessions={() => Promise.resolve([])}
        startSession={() => Promise.resolve(fresh({ id: 'sess-1' }))}
        transport={transport}
        recorderDebounceMs={0}
      />,
    );

    await screen.findByTestId('start-panel');
    await userEvent.click(screen.getByTestId('start-session-button'));
    await screen.findByTestId('active-session');

    const countRep = () => screen.getByTestId('manual-rep-button');
    // Exercise a completes; its PATCH fails, so results are buffered + surfaced.
    await userEvent.click(countRep());
    await userEvent.click(countRep());
    await screen.findByTestId('save-retry');

    // Exercise b completes → the next transition retries a AND saves b; finalise runs.
    await userEvent.click(countRep());
    await userEvent.click(countRep());

    await screen.findByTestId('session-complete');
    await waitFor(() => expect(finalize).toHaveBeenCalledTimes(1));

    // No data lost: a was retried and both exercises were persisted.
    const persisted = patch.mock.calls.map(([r]) => r.exerciseId);
    expect(persisted.filter((id) => id === 'a').length).toBeGreaterThanOrEqual(2);
    expect(persisted).toContain('b');
    await screen.findByTestId('finalized');
  });
});
