import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraPoseFeed } from '../../src/components/CameraPoseFeed';
import type { Landmark, LandmarkFrame } from '../../src/lib/repCounter';
import type { PoseDetector } from '../../src/lib/poseLandmarker';

function makeStream() {
  const track = Object.assign(new EventTarget(), { kind: 'video', stop: vi.fn() });
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

function confidentFrame(confidence = 0.9): LandmarkFrame {
  const landmarks: Landmark[] = Array.from({ length: 33 }, (_, i) => ({
    x: (i % 10) / 10,
    y: (i % 10) / 10,
    z: 0,
    confidence,
  }));
  return { landmarks, timestamp: 0 };
}

let rafCallbacks: FrameRequestCallback[] = [];
let clock = 0;

/** Invoke the most-recently-scheduled rAF callback, advancing the clock. */
function pumpFrame(stepMs = 100) {
  const cb = rafCallbacks[rafCallbacks.length - 1];
  clock += stepMs;
  act(() => cb?.(clock));
}

beforeEach(() => {
  rafCallbacks = [];
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Mark the rendered <video> as having decodable frames of a known size. */
function readyVideo() {
  const video = screen.getByTestId('camera-pose-video') as HTMLVideoElement;
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
  return video;
}

describe('CameraPoseFeed', () => {
  it('is idle (no inference) without a stream', () => {
    const createDetector = vi.fn(async () => ({ detect: vi.fn(), close: vi.fn() }));
    render(<CameraPoseFeed stream={null} createDetector={createDetector} />);
    expect(screen.getByTestId('camera-pose-feed')).toHaveAttribute('data-status', 'idle');
    expect(createDetector).not.toHaveBeenCalled();
  });

  it('tracks: emits reliable landmarks and paints once a pose is confirmed', async () => {
    const frame = confidentFrame();
    const detector: PoseDetector = { detect: vi.fn(() => frame), close: vi.fn() };
    const createDetector = vi.fn(async () => detector);
    const onLandmarks = vi.fn();

    render(
      <CameraPoseFeed
        stream={makeStream()}
        active
        onLandmarks={onLandmarks}
        createDetector={createDetector}
      />,
    );

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));
    readyVideo();

    // Debounce is 3 reliable frames before promotion to tracking.
    pumpFrame();
    pumpFrame();
    pumpFrame();
    pumpFrame();

    await waitFor(() =>
      expect(screen.getByTestId('camera-pose-feed')).toHaveAttribute('data-status', 'tracking'),
    );
    expect(onLandmarks).toHaveBeenCalledWith(frame);
    expect(screen.queryByTestId('pose-hint')).not.toBeInTheDocument();
  });

  it("searching: shows the 'get in frame' hint and emits nothing when no pose is found", async () => {
    const detector: PoseDetector = { detect: vi.fn(() => null), close: vi.fn() };
    const createDetector = vi.fn(async () => detector);
    const onLandmarks = vi.fn();

    render(
      <CameraPoseFeed
        stream={makeStream()}
        active
        onLandmarks={onLandmarks}
        createDetector={createDetector}
      />,
    );

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));
    readyVideo();
    pumpFrame();
    pumpFrame();

    await waitFor(() => expect(screen.getByTestId('pose-hint')).toBeInTheDocument());
    expect(screen.getByTestId('camera-pose-feed')).toHaveAttribute('data-status', 'searching');
    expect(onLandmarks).not.toHaveBeenCalled();
  });

  it('does not emit unreliable (low-confidence) frames', async () => {
    const detector: PoseDetector = { detect: vi.fn(() => confidentFrame(0.1)), close: vi.fn() };
    const createDetector = vi.fn(async () => detector);
    const onLandmarks = vi.fn();

    render(
      <CameraPoseFeed
        stream={makeStream()}
        active
        minConfidence={0.5}
        onLandmarks={onLandmarks}
        createDetector={createDetector}
      />,
    );

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));
    readyVideo();
    pumpFrame();
    pumpFrame();
    pumpFrame();
    pumpFrame();

    expect(onLandmarks).not.toHaveBeenCalled();
    expect(screen.getByTestId('camera-pose-feed')).toHaveAttribute('data-status', 'searching');
  });

  it('shows a non-blocking notice when the detector fails to initialise', async () => {
    const createDetector = vi.fn(async () => {
      throw new Error('wasm unavailable');
    });
    render(<CameraPoseFeed stream={makeStream()} active createDetector={createDetector} />);
    expect(await screen.findByTestId('pose-error')).toBeInTheDocument();
  });

  it('throttles inference to the target rate (skips frames that arrive too fast)', async () => {
    const detector: PoseDetector = { detect: vi.fn(() => null), close: vi.fn() };
    const createDetector = vi.fn(async () => detector);

    render(
      <CameraPoseFeed
        stream={makeStream()}
        active
        targetFps={10}
        createDetector={createDetector}
      />,
    );
    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));
    readyVideo();
    (detector.detect as ReturnType<typeof vi.fn>).mockClear();

    // 10 fps → 100ms min interval. Six 20ms animation frames span 120ms, so the
    // loop should throttle down to a single inference rather than one per frame.
    pumpFrame(20);
    pumpFrame(20);
    pumpFrame(20);
    pumpFrame(20);
    pumpFrame(20);
    pumpFrame(20);
    expect(detector.detect).toHaveBeenCalledTimes(1);
  });
});
