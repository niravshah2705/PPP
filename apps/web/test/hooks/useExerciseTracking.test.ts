import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExerciseTracking } from '../../src/hooks/useExerciseTracking';

/** A MediaStreamTrack-like EventTarget with a spyable stop(). */
function makeTrack() {
  const target = new EventTarget();
  return Object.assign(target, { kind: 'video', stop: vi.fn() });
}

function makeStream(track = makeTrack()) {
  return {
    track,
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
}

function stubGetUserMedia(impl: () => Promise<unknown>) {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(impl) } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useExerciseTracking', () => {
  it('enters camera mode when the camera is granted', async () => {
    stubGetUserMedia(() => Promise.resolve(makeStream()));
    const { result } = renderHook(() => useExerciseTracking());
    await waitFor(() => expect(result.current.mode).toBe('camera'));
    expect(result.current.cameraStatus).toBe('granted');
    expect(result.current.revoked).toBe(false);
  });

  it('falls back to manual mode when the camera is denied', async () => {
    stubGetUserMedia(() => Promise.reject({ name: 'NotAllowedError' }));
    const { result } = renderHook(() => useExerciseTracking());
    await waitFor(() => expect(result.current.mode).toBe('manual'));
    expect(result.current.cameraStatus).toBe('denied');
  });

  it('records manually-counted reps', async () => {
    stubGetUserMedia(() => Promise.reject({ name: 'NotFoundError' }));
    const { result } = renderHook(() => useExerciseTracking());
    await waitFor(() => expect(result.current.mode).toBe('manual'));
    act(() => result.current.completeRep());
    act(() => result.current.completeRep());
    expect(result.current.reps).toBe(2);
  });

  it('pauses tracking on mid-session revocation WITHOUT losing recorded reps', async () => {
    const track = makeTrack();
    stubGetUserMedia(() => Promise.resolve(makeStream(track)));
    const { result } = renderHook(() => useExerciseTracking());

    await waitFor(() => expect(result.current.mode).toBe('camera'));

    // Record progress while tracking is active.
    act(() => result.current.completeRep());
    act(() => result.current.completeRep());
    expect(result.current.reps).toBe(2);

    // Camera is pulled mid-session (revoked / unplugged).
    act(() => {
      track.dispatchEvent(new Event('ended'));
    });

    await waitFor(() => expect(result.current.mode).toBe('manual'));
    expect(result.current.revoked).toBe(true);
    expect(result.current.cameraStatus).toBe('lost');
    // Recorded results are preserved…
    expect(result.current.reps).toBe(2);
    // …and the live track was released.
    expect(track.stop).toHaveBeenCalled();

    // The patient can still complete more reps manually.
    act(() => result.current.completeRep());
    expect(result.current.reps).toBe(3);
  });
});
