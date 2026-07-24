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

describe('useExerciseTracking — sequencer wiring', () => {
  const twoExercises = [
    { exerciseId: 'a', targetReps: 2, sets: 1, restSec: 0 },
    { exerciseId: 'b', targetReps: 2, sets: 1, restSec: 0 },
  ];

  it('auto-completes at target, advances, and PATCHes each finished exercise', async () => {
    stubGetUserMedia(() => Promise.reject({ name: 'NotAllowedError' }));
    const persist = vi.fn();
    const { result } = renderHook(() =>
      useExerciseTracking({ exercises: twoExercises, sessionId: 's1', persist }),
    );
    await waitFor(() => expect(result.current.mode).toBe('manual'));
    expect(result.current.currentExerciseId).toBe('a');

    // Reaching the target auto-completes exercise a and advances to b.
    act(() => result.current.completeRep({ formScore: 80, rom: 40 }));
    act(() => result.current.completeRep({ formScore: 100, rom: 50 }));

    await waitFor(() =>
      expect(persist).toHaveBeenCalledWith('s1', {
        exerciseId: 'a',
        completedReps: 2,
        avgFormScore: 90,
        maxRangeOfMotionDeg: 50,
      }),
    );
    expect(result.current.currentExerciseId).toBe('b');

    // Manual override completes exercise b with fewer reps than the target.
    act(() => result.current.completeRep());
    act(() => result.current.completeSet());
    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(persist).toHaveBeenCalledWith('s1', {
      exerciseId: 'b',
      completedReps: 1,
      avgFormScore: null,
      maxRangeOfMotionDeg: null,
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('does not PATCH when no sessionId is supplied', async () => {
    stubGetUserMedia(() => Promise.reject({ name: 'NotAllowedError' }));
    const persist = vi.fn();
    const { result } = renderHook(() =>
      useExerciseTracking({ exercises: twoExercises, persist }),
    );
    await waitFor(() => expect(result.current.mode).toBe('manual'));
    act(() => result.current.completeRep());
    act(() => result.current.completeRep());
    expect(result.current.currentExerciseId).toBe('b');
    expect(persist).not.toHaveBeenCalled();
  });

  it('transitions to rest between sets and resumes on endRest', async () => {
    stubGetUserMedia(() => Promise.reject({ name: 'NotAllowedError' }));
    const { result } = renderHook(() =>
      useExerciseTracking({
        exercises: [{ exerciseId: 'a', targetReps: 2, sets: 2, restSec: 30 }],
      }),
    );
    await waitFor(() => expect(result.current.mode).toBe('manual'));

    act(() => result.current.completeRep());
    act(() => result.current.completeRep());
    expect(result.current.phase).toBe('resting');
    expect(result.current.setNumber).toBe(2);

    act(() => result.current.endRest());
    expect(result.current.phase).toBe('active');

    act(() => result.current.completeRep());
    act(() => result.current.completeRep());
    expect(result.current.isComplete).toBe(true);
    expect(result.current.reps).toBe(4);
  });
});
