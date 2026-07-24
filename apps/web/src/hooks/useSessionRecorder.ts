import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { finalizeSession, patchSessionResults } from '../api/sessions';
import {
  SessionResultRecorder,
  type RecorderTransport,
} from '../lib/sessionRecorder';
import type { TrackedExerciseResult } from '../lib/sessionSequencer';

/**
 * Coarse view of where the recorder is, for player chrome.
 *
 * - `idle`       — nothing buffered yet.
 * - `saving`     — a flush is in flight.
 * - `saved`      — everything buffered has been persisted.
 * - `error`      — a PATCH failed; results are still buffered and will retry.
 * - `finalizing` — flushing + writing the completion.
 * - `completed`  — the session was finalised.
 */
export type RecorderStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'finalizing'
  | 'completed';

export interface UseSessionRecorderOptions {
  /** The session to record into, or null before Start (record/finish are no-ops). */
  sessionId: string | null;
  /** Injectable transport (defaults to the real PATCH/finalise) — used by tests. */
  transport?: RecorderTransport;
  /** Debounce window (ms) used to batch rapid completions into one flush. */
  debounceMs?: number;
}

export interface UseSessionRecorderResult {
  /** Buffer one exercise's results and schedule a (debounced) flush. */
  record(result: TrackedExerciseResult): void;
  /** Flush the buffer and finalise the session. Resolves true once finalised. */
  finish(): Promise<boolean>;
  /** Retry persisting whatever is still buffered (manual "retry" affordance). */
  retry(): void;
  /** Results still awaiting persistence. */
  pendingCount: number;
  /** Coarse status for chrome. */
  status: RecorderStatus;
}

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * React wrapper around {@link SessionResultRecorder}.
 *
 * Owns the recorder for the current `sessionId`, debounces record→flush so a
 * burst of finished exercises batches into a single PATCH round, and exposes a
 * coarse {@link RecorderStatus} for the player chrome. A failed flush keeps the
 * buffered results (see the recorder) and is retried on the next `record`, the
 * `retry()` affordance, or `finish()` — so transient network errors never lose
 * data.
 */
export function useSessionRecorder({
  sessionId,
  transport,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseSessionRecorderOptions): UseSessionRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  // The transport for the current session. Inert until a session exists, so the
  // recorder is a no-op before Start even when a transport is injected.
  const liveTransport = useMemo<RecorderTransport | null>(() => {
    if (!sessionId) return null;
    if (transport) return transport;
    return {
      patch: (result) => patchSessionResults(sessionId, result),
      finalize: () => finalizeSession(sessionId),
    };
  }, [transport, sessionId]);

  const recorderRef = useRef<SessionResultRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // (Re)build the recorder whenever the session/transport changes.
  useEffect(() => {
    recorderRef.current = liveTransport ? new SessionResultRecorder(liveTransport) : null;
    setStatus('idle');
    setPendingCount(0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [liveTransport]);

  const flushNow = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setStatus('saving');
    const { pending } = await rec.flush();
    setPendingCount(pending);
    setStatus(pending > 0 ? 'error' : 'saved');
  }, []);

  const record = useCallback(
    (result: TrackedExerciseResult) => {
      const rec = recorderRef.current;
      if (!rec) return;
      // Buffer synchronously so the result is durable before the debounce fires.
      rec.buffer(result);
      setPendingCount(rec.pendingCount);
      setStatus('saving');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flushNow();
      }, debounceMs);
    },
    [debounceMs, flushNow],
  );

  const finish = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus('finalizing');
    let done = false;
    try {
      done = await rec.finish();
    } catch {
      // Finalise (or a flush within it) failed — buffered results are kept for
      // a retry; surface the retryable error state.
      done = false;
    }
    setPendingCount(rec.pendingCount);
    setStatus(done ? 'completed' : 'error');
    return done;
  }, []);

  const retry = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void flushNow();
  }, [flushNow]);

  return { record, finish, retry, pendingCount, status };
}
