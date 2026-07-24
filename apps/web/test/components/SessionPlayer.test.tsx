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
