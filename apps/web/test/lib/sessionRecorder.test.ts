import { describe, expect, it, vi } from 'vitest';
import { SessionResultRecorder } from '../../src/lib/sessionRecorder';
import type { TrackedExerciseResult } from '../../src/lib/sessionSequencer';

function result(exerciseId: string, completedReps = 5): TrackedExerciseResult {
  return { exerciseId, completedReps, avgFormScore: null, maxRangeOfMotionDeg: null };
}

describe('SessionResultRecorder', () => {
  it('records and persists a buffered result, then clears the buffer', async () => {
    const patch = vi.fn(() => Promise.resolve());
    const finalize = vi.fn(() => Promise.resolve());
    const rec = new SessionResultRecorder({ patch, finalize });

    const outcome = await rec.record(result('a'));
    expect(patch).toHaveBeenCalledWith(result('a'));
    expect(outcome).toEqual({ saved: 1, pending: 0 });
    expect(rec.pendingCount).toBe(0);
  });

  it('keeps a result buffered when its PATCH fails, then persists it on retry', async () => {
    const patch = vi
      .fn<(result: TrackedExerciseResult) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue();
    const finalize = vi.fn(() => Promise.resolve());
    const rec = new SessionResultRecorder({ patch, finalize });

    // First attempt fails — result is NOT lost.
    const first = await rec.record(result('a'));
    expect(first).toEqual({ saved: 0, pending: 1 });
    expect(rec.pendingCount).toBe(1);

    // Next transition retries and succeeds without re-supplying the data.
    const second = await rec.flush();
    expect(second).toEqual({ saved: 1, pending: 0 });
    expect(rec.pendingCount).toBe(0);
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it('upserts by exerciseId so a re-record replaces the buffered value', async () => {
    const patch = vi.fn<(result: TrackedExerciseResult) => Promise<void>>(() =>
      Promise.reject(new Error('offline')),
    );
    const rec = new SessionResultRecorder({ patch, finalize: vi.fn() });

    await rec.record(result('a', 3));
    rec.buffer(result('a', 9)); // corrected aggregate for the same exercise
    expect(rec.pendingCount).toBe(1);

    patch.mockResolvedValue(undefined);
    await rec.flush();
    // The last write wins — persisted with the corrected reps.
    expect(patch).toHaveBeenLastCalledWith(result('a', 9));
  });

  it('batches multiple buffered exercises into one flush', async () => {
    const patch = vi.fn(() => Promise.resolve());
    const rec = new SessionResultRecorder({ patch, finalize: vi.fn() });

    rec.buffer(result('a'));
    rec.buffer(result('b'));
    const outcome = await rec.flush();
    expect(outcome).toEqual({ saved: 2, pending: 0 });
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it('finish() flushes then finalises only when the buffer is empty', async () => {
    const patch = vi.fn(() => Promise.resolve());
    const finalize = vi.fn(() => Promise.resolve());
    const rec = new SessionResultRecorder({ patch, finalize });

    rec.buffer(result('a'));
    const done = await rec.finish();
    expect(done).toBe(true);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(rec.isFinalized).toBe(true);
  });

  it('finish() does NOT finalise while results are still buffered (no data loss)', async () => {
    const patch = vi
      .fn<(result: TrackedExerciseResult) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue();
    const finalize = vi.fn(() => Promise.resolve());
    const rec = new SessionResultRecorder({ patch, finalize });

    rec.buffer(result('a'));
    const firstTry = await rec.finish();
    expect(firstTry).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
    expect(rec.pendingCount).toBe(1); // buffered result preserved

    // Retry once the network recovers: buffer drains, then finalise runs.
    const secondTry = await rec.finish();
    expect(secondTry).toBe(true);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it('finish() is idempotent after success', async () => {
    const finalize = vi.fn(() => Promise.resolve());
    const rec = new SessionResultRecorder({ patch: vi.fn(() => Promise.resolve()), finalize });
    await rec.finish();
    await rec.finish();
    expect(finalize).toHaveBeenCalledTimes(1);
  });
});
