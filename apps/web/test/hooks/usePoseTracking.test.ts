import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePoseTracking } from '../../src/hooks/usePoseTracking';
import type { PoseDetector } from '../../src/lib/poseLandmarker';

function makeStream() {
  const track = Object.assign(new EventTarget(), { kind: 'video', stop: vi.fn() });
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

function fakeDetector(overrides: Partial<PoseDetector> = {}): PoseDetector {
  return { detect: vi.fn(() => null), close: vi.fn(), ...overrides };
}

beforeEach(() => {
  // Capture rAF callbacks instead of running a real loop; the lifecycle tests
  // don't need to tick frames (that is covered by the CameraPoseFeed tests).
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('usePoseTracking lifecycle', () => {
  it('is idle when inactive or without a stream', async () => {
    const createDetector = vi.fn(async () => fakeDetector());
    const { result } = renderHook(() =>
      usePoseTracking({ stream: null, active: true, createDetector }),
    );
    expect(result.current.status).toBe('idle');
    expect(createDetector).not.toHaveBeenCalled();
  });

  it('enters loading and builds a detector when active with a stream', async () => {
    const stream = makeStream();
    const detector = fakeDetector();
    const createDetector = vi.fn(async () => detector);
    const { result } = renderHook(() =>
      usePoseTracking({ stream, active: true, createDetector }),
    );
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(createDetector).toHaveBeenCalledTimes(1));
  });

  it('surfaces error status when the detector fails to initialise', async () => {
    const stream = makeStream();
    const createDetector = vi.fn(async () => {
      throw new Error('wasm boom');
    });
    const { result } = renderHook(() =>
      usePoseTracking({ stream, active: true, createDetector }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('closes the detector on teardown (no runaway loop when leaving)', async () => {
    const stream = makeStream();
    const detector = fakeDetector();
    const createDetector = vi.fn(async () => detector);
    const { unmount } = renderHook(() =>
      usePoseTracking({ stream, active: true, createDetector }),
    );
    await waitFor(() => expect(createDetector).toHaveBeenCalled());
    // Let the resolve microtask assign the detector.
    await act(async () => {});
    unmount();
    expect(detector.close).toHaveBeenCalledTimes(1);
  });

  it('tears down back to idle when deactivated', async () => {
    const stream = makeStream();
    const detector = fakeDetector();
    const createDetector = vi.fn(async () => detector);
    const { result, rerender } = renderHook(
      ({ active }) => usePoseTracking({ stream, active, createDetector }),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(createDetector).toHaveBeenCalled());
    await act(async () => {});
    rerender({ active: false });
    expect(result.current.status).toBe('idle');
    expect(detector.close).toHaveBeenCalled();
  });
});
