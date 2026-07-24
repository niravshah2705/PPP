/**
 * Session result recorder — the durable, framework-agnostic buffer that stands
 * between "an exercise finished" and "its results are safely on the server".
 *
 * Monitoring must not lose data to a flaky network, so per-exercise results are
 * held in a local buffer and only removed once their PATCH succeeds. A failed
 * PATCH keeps the buffered result and is retried on the next transition (the
 * next `record`, an explicit `flush`, or `finish`). Batching multiple pending
 * results into one flush is the caller's concern (see `useSessionRecorder`,
 * which debounces); this module guarantees the no-loss semantics.
 *
 * It is intentionally pure of React and of the concrete transport — the PATCH
 * and finalise calls are injected — so the buffer/retry logic is exhaustively
 * testable in isolation.
 */

import type { TrackedExerciseResult } from './sessionSequencer';

/** Injected transport: how a buffered result is persisted / the session ended. */
export interface RecorderTransport {
  /** Persist one exercise's results. Rejects on transport/server failure. */
  patch: (result: TrackedExerciseResult) => Promise<void>;
  /** Mark the session completed. Rejects on transport/server failure. */
  finalize: () => Promise<void>;
}

/** Outcome of a flush attempt, for callers that surface retry state. */
export interface FlushOutcome {
  /** Results persisted in this flush. */
  saved: number;
  /** Results still buffered (a failure occurred) awaiting the next retry. */
  pending: number;
}

/**
 * Buffers per-exercise results and flushes them to the server without losing
 * data on transient failures.
 *
 * Results are keyed by `exerciseId`, so re-recording the same exercise (e.g. a
 * corrected aggregate) replaces the buffered value rather than duplicating it,
 * and a still-pending result is overwritten by its newer version.
 */
export class SessionResultRecorder {
  private readonly pending = new Map<string, TrackedExerciseResult>();
  private flushing: Promise<FlushOutcome> | null = null;
  private finalized = false;

  constructor(private readonly transport: RecorderTransport) {}

  /** Number of results still waiting to be persisted. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** True once the session has been finalised (completion write succeeded). */
  get isFinalized(): boolean {
    return this.finalized;
  }

  /**
   * Buffer one exercise's results (upsert by `exerciseId`) WITHOUT flushing.
   * Used by the debounced hook to batch several rapid completions into a single
   * flush; the buffered value is durable until a flush persists it.
   */
  buffer(result: TrackedExerciseResult): void {
    this.pending.set(result.exerciseId, result);
  }

  /**
   * Buffer one exercise's results (upsert by `exerciseId`) and attempt to flush.
   * The returned promise resolves after the flush attempt; a failure does NOT
   * reject — the result stays buffered for the next retry.
   */
  async record(result: TrackedExerciseResult): Promise<FlushOutcome> {
    this.buffer(result);
    return this.flush();
  }

  /**
   * Attempt to persist every buffered result. Successful writes are removed;
   * failed writes are kept for the next retry. Concurrent flushes coalesce onto
   * the in-flight attempt so a debounced caller never double-sends.
   */
  flush(): Promise<FlushOutcome> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<FlushOutcome> {
    let saved = 0;
    // Snapshot the keys so entries added mid-flush wait for the next attempt.
    for (const id of [...this.pending.keys()]) {
      const result = this.pending.get(id);
      if (!result) continue;
      try {
        await this.transport.patch(result);
        // Only delete if unchanged since we read it — a newer record() wins.
        if (this.pending.get(id) === result) this.pending.delete(id);
        saved += 1;
      } catch {
        // Keep buffered; retried on the next transition. No data lost.
      }
    }
    return { saved, pending: this.pending.size };
  }

  /**
   * Flush any buffered results, then finalise the session — but only once the
   * buffer is empty, so finalising never abandons unsaved results. Returns true
   * when the session was finalised; false when results are still pending (the
   * caller should retry). Idempotent: a second successful call is a no-op.
   */
  async finish(): Promise<boolean> {
    if (this.finalized) return true;
    const { pending } = await this.flush();
    if (pending > 0) return false;
    await this.transport.finalize();
    this.finalized = true;
    return true;
  }
}
