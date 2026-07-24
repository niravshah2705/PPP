import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SharedPlan } from '../types/sharedPlan';
import type { Session } from '../types/session';
import { createSession, fetchSessions, type CreateSessionInput } from '../api/sessions';
import type { RecorderTransport } from '../lib/sessionRecorder';
import { findResumableSession, planToSequencerExercises } from '../lib/planSession';
import type { SequencerExercise } from '../lib/sessionSequencer';
import { useExerciseTracking } from '../hooks/useExerciseTracking';
import { useSessionRecorder } from '../hooks/useSessionRecorder';
import { CameraNotice } from './CameraNotice';
import { InlineErrorCard } from './InlineErrorCard';
import './PatientPlanPlayer.css';

/** Orchestration phase of the patient player before/while a session runs. */
type Phase = 'checking' | 'prompt' | 'idle' | 'active';

export interface PatientPlanPlayerProps {
  /** The loaded patient-facing plan payload (from `/patient?planId=`). */
  plan: SharedPlan;
  /** Look up the plan's existing sessions (defaults to the real GET). Injectable for tests. */
  loadSessions?: (planId: string) => Promise<Session[]>;
  /** Open a new session (defaults to the real POST). Injectable for tests. */
  startSession?: (input: CreateSessionInput) => Promise<Session>;
  /** Recorder transport override (defaults to the real PATCH/finalise). Injectable for tests. */
  transport?: RecorderTransport;
  /** Recorder debounce window; tests pass 0 to flush synchronously. */
  recorderDebounceMs?: number;
}

/**
 * Patient-facing plan player at `/patient?planId=`.
 *
 * It owns the session backbone the ticket describes:
 * - **Resume** — on open it checks the plan's sessions; an `in_progress` one
 *   (left by a tab closed mid-session) surfaces a resume prompt.
 * - **Start** — opens a new `in_progress` session (`POST /api/sessions`) tied to
 *   the loaded plan's `planId`/`patientName`.
 * - **Record + finalise** — the active session (see {@link ActivePlanSession})
 *   PATCHes per-exercise results as the patient progresses and finalises the
 *   session on the completion screen, buffering results so a transient network
 *   error never loses data.
 */
export function PatientPlanPlayer({
  plan,
  loadSessions = fetchSessions,
  startSession = createSession,
  transport,
  recorderDebounceMs,
}: PatientPlanPlayerProps) {
  const exercises = useMemo<SequencerExercise[]>(
    () => planToSequencerExercises(plan),
    [plan],
  );

  const [phase, setPhase] = useState<Phase>('checking');
  const [resumable, setResumable] = useState<Session | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // On open, look for an in-progress session to resume. A failed lookup is
  // non-fatal — the patient can still start fresh.
  useEffect(() => {
    let cancelled = false;
    setPhase('checking');
    loadSessions(plan.id)
      .then((sessions) => {
        if (cancelled) return;
        const found = findResumableSession(sessions);
        setResumable(found);
        setPhase(found ? 'prompt' : 'idle');
      })
      .catch(() => {
        if (!cancelled) setPhase('idle');
      });
    return () => {
      cancelled = true;
    };
  }, [plan.id, loadSessions]);

  const start = useCallback(async () => {
    setStartError(null);
    setStarting(true);
    try {
      const session = await startSession({
        planId: plan.id,
        patientName: plan.patientName,
      });
      setSessionId(session.id);
      setPhase('active');
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start the session');
    } finally {
      setStarting(false);
    }
  }, [plan.id, plan.patientName, startSession]);

  const resume = useCallback(() => {
    if (!resumable) return;
    setSessionId(resumable.id);
    setPhase('active');
  }, [resumable]);

  if (exercises.length === 0) {
    return (
      <InlineErrorCard
        title="Nothing to do yet"
        message="This plan has no exercises. Ask your clinician to add some."
      />
    );
  }

  return (
    <div className="patient-plan" data-testid="patient-plan" data-phase={phase}>
      <header className="patient-plan__header">
        <h1 className="patient-plan__title">Your exercise session</h1>
        {plan.patientName && (
          <p className="patient-plan__patient" data-testid="patient-name">
            {plan.patientName}
          </p>
        )}
      </header>

      {phase === 'checking' && (
        <p data-testid="patient-plan-checking">Loading your plan…</p>
      )}

      {phase === 'prompt' && resumable && (
        <div className="patient-plan__resume" data-testid="resume-prompt" role="dialog">
          <p>You have a session already in progress. Pick up where you left off?</p>
          <div className="patient-plan__resume-actions">
            <button type="button" data-testid="resume-button" onClick={resume}>
              Resume session
            </button>
            <button
              type="button"
              data-testid="start-over-button"
              onClick={start}
              disabled={starting}
            >
              Start over
            </button>
          </div>
          {startError && (
            <p className="patient-plan__error" role="alert" data-testid="start-error">
              {startError}
            </p>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <div className="patient-plan__start" data-testid="start-panel">
          <p>{exercises.length} exercise{exercises.length === 1 ? '' : 's'} ready.</p>
          <button
            type="button"
            data-testid="start-session-button"
            onClick={start}
            disabled={starting}
          >
            {starting ? 'Starting…' : 'Start session'}
          </button>
          {startError && (
            <p className="patient-plan__error" role="alert" data-testid="start-error">
              {startError}
            </p>
          )}
        </div>
      )}

      {phase === 'active' && sessionId && (
        <ActivePlanSession
          sessionId={sessionId}
          exercises={exercises}
          transport={transport}
          recorderDebounceMs={recorderDebounceMs}
        />
      )}
    </div>
  );
}

interface ActivePlanSessionProps {
  sessionId: string;
  exercises: SequencerExercise[];
  transport?: RecorderTransport;
  recorderDebounceMs?: number;
}

/**
 * The running session: sequences the plan's exercises and records results.
 *
 * Rep progress (tracked or manually counted) drives the sequencer; each finished
 * exercise's aggregate is handed to the {@link useSessionRecorder}, which buffers
 * and batches the PATCH and keeps failed writes for retry. When every exercise
 * is done the session is finalised — and finalisation waits for the buffer to
 * drain, so completing never abandons unsaved results.
 */
function ActivePlanSession({
  sessionId,
  exercises,
  transport,
  recorderDebounceMs,
}: ActivePlanSessionProps) {
  const recorder = useSessionRecorder({
    sessionId,
    transport,
    debounceMs: recorderDebounceMs,
  });

  const { record, finish, retry, status: recorderStatus, pendingCount } = recorder;

  // Route each finished exercise's aggregate through the recorder's buffer.
  const persist = useCallback(
    (_sessionId: string, result: Parameters<typeof record>[0]) => {
      record(result);
    },
    [record],
  );

  const {
    mode,
    cameraStatus,
    reps,
    revoked,
    completeRep,
    retryCamera,
    phase,
    setNumber,
    setCount,
    exerciseNumber,
    exerciseCount,
    targetReps,
    repsInSet,
    isComplete,
    completeSet,
    next,
  } = useExerciseTracking({ exercises, sessionId, persist });

  // Finalise once when the sequence completes. The final exercise's results are
  // handed to the recorder via a microtask (see `useExerciseTracking`), so we
  // defer the finalise to a macrotask — guaranteeing the last result is buffered
  // before `finish()` flushes and finalises. A failed finalise leaves the
  // recorder in `error`; the completion screen offers a retry.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (!isComplete || finishedRef.current) return undefined;
    finishedRef.current = true;
    const id = setTimeout(() => {
      void finish();
    }, 0);
    return () => clearTimeout(id);
  }, [isComplete, finish]);

  const tracking = mode === 'camera';
  const resting = phase === 'resting';
  const canRecord = phase === 'active';
  const hasUnsaved = pendingCount > 0;

  return (
    <div
      className="patient-plan__session"
      data-testid="active-session"
      data-mode={mode}
      data-phase={phase}
      data-complete={isComplete ? 'true' : 'false'}
      data-recorder={recorderStatus}
    >
      {mode === 'initialising' ? (
        <div className="patient-plan__tracking" data-testid="tracking-initialising">
          Starting camera…
        </div>
      ) : tracking ? (
        <div className="patient-plan__tracking" data-testid="tracking-overlay">
          <span className="patient-plan__tracking-dot" /> Tracking active
        </div>
      ) : (
        <CameraNotice status={cameraStatus} revoked={revoked} onRetry={retryCamera} />
      )}

      <p className="patient-plan__progress" data-testid="set-progress">
        Exercise {exerciseNumber} of {exerciseCount} · Set <strong>{setNumber}</strong> of{' '}
        {setCount} · {repsInSet}/{targetReps} reps
      </p>

      <p className="patient-plan__reps" data-testid="rep-count">
        Reps completed: <strong>{reps}</strong>
      </p>

      {resting && (
        <div className="patient-plan__rest" data-testid="rest-panel">
          <span>Resting between sets…</span>
          <button type="button" data-testid="skip-rest-button" onClick={next}>
            Resume
          </button>
        </div>
      )}

      {!isComplete && (
        <footer className="patient-plan__controls" data-testid="player-controls">
          <button
            type="button"
            data-testid="manual-rep-button"
            onClick={() => completeRep()}
            disabled={!canRecord}
          >
            Count rep
          </button>
          <button
            type="button"
            data-testid="complete-set-button"
            onClick={completeSet}
            disabled={!canRecord}
          >
            Complete set
          </button>
          <button type="button" data-testid="next-button" onClick={next}>
            Next
          </button>
        </footer>
      )}

      {/* Buffered-results indicator while the session is still running. */}
      {!isComplete && hasUnsaved && recorderStatus === 'error' && (
        <div className="patient-plan__save-warning" role="status" data-testid="save-retry">
          <span>Couldn’t save your last results. They’re kept and will retry.</span>
          <button type="button" data-testid="retry-save-button" onClick={retry}>
            Retry now
          </button>
        </div>
      )}

      {isComplete && (
        <div className="patient-plan__complete" data-testid="session-complete">
          <p>Session complete — great work!</p>
          {recorderStatus === 'finalizing' && (
            <p data-testid="finalizing">Saving your results…</p>
          )}
          {recorderStatus === 'completed' && (
            <p data-testid="finalized">All results saved.</p>
          )}
          {recorderStatus === 'error' && (
            <div className="patient-plan__save-warning" role="alert" data-testid="finalize-error">
              <span>Couldn’t finish saving. Your results are safe — retry to finalise.</span>
              <button type="button" data-testid="retry-finalize-button" onClick={() => void finish()}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
