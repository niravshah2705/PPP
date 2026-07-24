import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/scene/demoScene', () => ({
  createDemoScene: vi.fn(() => ({ dispose: vi.fn(), running: true })),
}));

import { SessionPlayer } from '../../src/components/SessionPlayer';

const exercise = { id: 'knee-1', name: 'Knee Raise', description: 'Lift and hold' };

function makeTrack() {
  const target = new EventTarget();
  return Object.assign(target, { kind: 'video', stop: vi.fn() });
}

function makeStream(track = makeTrack()) {
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}

/**
 * Stub navigator with controllable camera + WebXR. `getUserMedia` may resolve a
 * stream or reject with a DOMException-like `{ name }`.
 */
function stubEnvironment(opts: {
  getUserMedia: () => Promise<unknown>;
  webXR?: boolean;
}) {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(opts.getUserMedia) },
    xr: opts.webXR
      ? { isSessionSupported: vi.fn(() => Promise.resolve(true)) }
      : undefined,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SessionPlayer graceful degradation', () => {
  it('shows the tracking overlay when the camera is granted', async () => {
    stubEnvironment({ getUserMedia: () => Promise.resolve(makeStream()) });
    render(<SessionPlayer exercise={exercise} />);
    expect(await screen.findByTestId('tracking-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('camera-notice')).not.toBeInTheDocument();
  });

  it('camera-denied: shows a clear notice and lets the patient count reps manually', async () => {
    stubEnvironment({ getUserMedia: () => Promise.reject({ name: 'NotAllowedError' }) });
    render(<SessionPlayer exercise={exercise} />);

    const notice = await screen.findByTestId('camera-notice');
    expect(notice).toHaveTextContent(/manually/i);
    expect(screen.queryByTestId('tracking-overlay')).not.toBeInTheDocument();

    // Progression is possible via manual counting.
    const button = screen.getByTestId('manual-rep-button');
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.getByTestId('rep-count')).toHaveTextContent('2');
  });

  it('no-camera: shows a notice and still allows manual completion', async () => {
    stubEnvironment({ getUserMedia: () => Promise.reject({ name: 'NotFoundError' }) });
    render(<SessionPlayer exercise={exercise} />);
    const notice = await screen.findByTestId('camera-notice');
    expect(notice).toHaveAttribute('data-status', 'no-camera');
    expect(screen.getByTestId('manual-rep-button')).toBeInTheDocument();
  });

  it('camera unsupported: shows a notice and manual controls', async () => {
    // No mediaDevices at all.
    vi.stubGlobal('navigator', { xr: undefined });
    render(<SessionPlayer exercise={exercise} />);
    const notice = await screen.findByTestId('camera-notice');
    expect(notice).toHaveAttribute('data-status', 'unsupported');
    expect(screen.getByTestId('manual-rep-button')).toBeInTheDocument();
  });

  it('mid-session revocation: pauses tracking, offers manual completion, keeps reps', async () => {
    const track = makeTrack();
    stubEnvironment({ getUserMedia: () => Promise.resolve(makeStream(track)) });
    render(<SessionPlayer exercise={exercise} />);

    await screen.findByTestId('tracking-overlay');
    expect(screen.getByTestId('rep-count')).toHaveTextContent('0');

    // Camera is revoked / unplugged mid-session.
    act(() => {
      track.dispatchEvent(new Event('ended'));
    });

    const notice = await screen.findByTestId('camera-notice');
    expect(notice).toHaveAttribute('data-status', 'lost');
    expect(notice).toHaveTextContent(/paused/i);
    expect(screen.queryByTestId('tracking-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('session-player')).toHaveAttribute('data-revoked', 'true');

    // Recorded results survive and manual completion is available.
    expect(screen.getByTestId('rep-count')).toHaveTextContent('0');
    await userEvent.click(screen.getByTestId('manual-rep-button'));
    expect(screen.getByTestId('rep-count')).toHaveTextContent('1');
  });
});

describe('SessionPlayer sequencer / auto-advance', () => {
  it('reaching the target auto-completes the set and advances to rest, then completes', async () => {
    stubEnvironment({ getUserMedia: () => Promise.reject({ name: 'NotAllowedError' }) });
    render(<SessionPlayer exercise={exercise} targetReps={2} sets={2} restSec={30} />);
    await screen.findByTestId('camera-notice');

    const countRep = screen.getByTestId('manual-rep-button');
    await userEvent.click(countRep);
    await userEvent.click(countRep); // hits target → set 1 done → rest

    expect(await screen.findByTestId('rest-panel')).toBeInTheDocument();
    expect(screen.getByTestId('set-progress')).toHaveTextContent('Set 2 of 2');

    // Resume and finish set 2 → session complete.
    await userEvent.click(screen.getByTestId('skip-rest-button'));
    await userEvent.click(countRep);
    await userEvent.click(countRep);
    expect(await screen.findByTestId('session-complete')).toBeInTheDocument();
    expect(screen.getByTestId('session-player')).toHaveAttribute('data-complete', 'true');
  });

  it('manual "Complete set" override lets the patient proceed when tracking stalls', async () => {
    stubEnvironment({ getUserMedia: () => Promise.resolve(makeStream()) });
    render(<SessionPlayer exercise={exercise} targetReps={5} sets={1} />);
    await screen.findByTestId('tracking-overlay');

    // Only one rep registers, then tracking stalls — the override finishes the set.
    await userEvent.click(screen.getByTestId('manual-rep-button'));
    await userEvent.click(screen.getByTestId('complete-set-button'));
    expect(await screen.findByTestId('session-complete')).toBeInTheDocument();
  });

  it('manual Next advances an active set identically to reaching the target', async () => {
    stubEnvironment({ getUserMedia: () => Promise.resolve(makeStream()) });
    render(<SessionPlayer exercise={exercise} targetReps={3} sets={2} restSec={0} />);
    await screen.findByTestId('tracking-overlay');
    expect(screen.getByTestId('set-progress')).toHaveTextContent('Set 1 of 2');

    // Next during an active set completes it; with no rest we land on set 2.
    await userEvent.click(screen.getByTestId('next-button'));
    expect(screen.getByTestId('set-progress')).toHaveTextContent('Set 2 of 2');
    expect(screen.queryByTestId('rest-panel')).not.toBeInTheDocument();
  });

  it('PATCHes tracked results to the session as the exercise completes', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    stubEnvironment({ getUserMedia: () => Promise.reject({ name: 'NotAllowedError' }) });
    render(<SessionPlayer exercise={exercise} targetReps={2} sets={1} sessionId="sess-9" />);
    await screen.findByTestId('camera-notice');

    const countRep = screen.getByTestId('manual-rep-button');
    await userEvent.click(countRep);
    await userEvent.click(countRep);

    await screen.findByTestId('session-complete');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
    const patchCall = calls.find(
      ([url, init]) => url === '/api/sessions/sess-9' && init?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body).toMatchObject({ exerciseId: 'knee-1', completedReps: 2 });
  });
});
