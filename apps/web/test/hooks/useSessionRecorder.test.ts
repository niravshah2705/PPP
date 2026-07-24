import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionRecorder } from '../../src/hooks/useSessionRecorder';
import type { RecorderTransport } from '../../src/lib/sessionRecorder';
import type { TrackedExerciseResult } from '../../src/lib/sessionSequencer';

function result(exerciseId: string): TrackedExerciseResult {
  return { exerciseId, completedReps: 4, avgFormScore: null, maxRangeOfMotionDeg: null };
}

afterEach(() => vi.restoreAllMocks());

describe('useSessionRecorder', () => {
  it('is inert (no-ops) before a session id exists', async () => {
    const patch = vi.fn(() => Promise.resolve());
    const transport: RecorderTransport = { patch, finalize: vi.fn(() => Promise.resolve()) };
    const { result: hook } = renderHook(() =>
      useSessionRecorder({ sessionId: null, transport, debounceMs: 0 }),
    );
    act(() => hook.current.record(result('a')));
    await act(async () => {
      await expect(hook.current.finish()).resolves.toBe(true);
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it('debounces record → a single flush that persists buffered results', async () => {
    const patch = vi.fn(() => Promise.resolve());
    const transport: RecorderTransport = { patch, finalize: vi.fn(() => Promise.resolve()) };
    const { result: hook } = renderHook(() =>
      useSessionRecorder({ sessionId: 's1', transport, debounceMs: 5 }),
    );

    act(() => {
      hook.current.record(result('a'));
      hook.current.record(result('b'));
    });

    await waitFor(() => expect(hook.current.status).toBe('saved'));
    expect(patch).toHaveBeenCalledTimes(2);
    expect(hook.current.pendingCount).toBe(0);
  });

  it('surfaces an error status and keeps buffered results when a PATCH fails, then retries', async () => {
    const patch = vi
      .fn<(result: TrackedExerciseResult) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue();
    const transport: RecorderTransport = { patch, finalize: vi.fn(() => Promise.resolve()) };
    const { result: hook } = renderHook(() =>
      useSessionRecorder({ sessionId: 's1', transport, debounceMs: 0 }),
    );

    act(() => hook.current.record(result('a')));
    await waitFor(() => expect(hook.current.status).toBe('error'));
    expect(hook.current.pendingCount).toBe(1);

    act(() => hook.current.retry());
    await waitFor(() => expect(hook.current.status).toBe('saved'));
    expect(hook.current.pendingCount).toBe(0);
  });

  it('finish() flushes then finalises, reaching completed', async () => {
    const finalize = vi.fn(() => Promise.resolve());
    const transport: RecorderTransport = { patch: vi.fn(() => Promise.resolve()), finalize };
    const { result: hook } = renderHook(() =>
      useSessionRecorder({ sessionId: 's1', transport, debounceMs: 0 }),
    );

    act(() => hook.current.record(result('a')));
    let done = false;
    await act(async () => {
      done = await hook.current.finish();
    });
    expect(done).toBe(true);
    expect(finalize).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(hook.current.status).toBe('completed'));
  });

  it('finish() reports error (not completed) when the buffer cannot drain', async () => {
    const patch = vi.fn(() => Promise.reject(new Error('offline')));
    const finalize = vi.fn(() => Promise.resolve());
    const transport: RecorderTransport = { patch, finalize };
    const { result: hook } = renderHook(() =>
      useSessionRecorder({ sessionId: 's1', transport, debounceMs: 0 }),
    );

    act(() => hook.current.record(result('a')));
    let done = true;
    await act(async () => {
      done = await hook.current.finish();
    });
    expect(done).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.current.status).toBe('error'));
  });
});
