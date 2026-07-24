/**
 * Types for the doctor session-review dashboard.
 *
 * These mirror the persisted records returned by the session/progress APIs so
 * the dashboard can render completion %, form, and ROM without recomputing (and
 * risking divergence from) the numbers the backend already stored.
 */

/** One exercise's result within a completed session. */
export interface ExerciseResult {
  /** Stable exercise id (matches the plan/exercise catalogue). */
  exerciseId: string;
  /** Human-readable exercise name shown in the drill-down. */
  name: string;
  /** Reps the plan asked for. */
  targetReps: number;
  /** Reps the patient actually completed. */
  completedReps: number;
  /** Average form score (0–100) for this exercise, or null if not measured. */
  avgForm: number | null;
  /** Best range-of-motion (degrees) reached, or null if not measured. */
  maxRom: number | null;
  /** True when the patient skipped this exercise entirely. */
  skipped: boolean;
}

/**
 * Lifecycle of a session as the patient works through the plan.
 *
 * - `in_progress` — created on Start; results are still being recorded. Closing
 *   the tab mid-session leaves the record here, so reopening the plan can offer
 *   to resume it.
 * - `completed`   — finalised on the completion screen (`completedAt` set).
 */
export type SessionStatus = 'in_progress' | 'completed';

/**
 * A single session for a plan. `completionPct` and `avgForm` are the persisted,
 * authoritative values — the review dashboard renders them verbatim.
 *
 * The lifecycle fields (`status`, `startedAt`, `completedAt`) are written by the
 * patient player as it creates, updates, and finalises the session. They are
 * optional so existing plan-scoped/review consumers are unaffected.
 */
export interface Session {
  id: string;
  planId: string;
  /**
   * Patient the session belongs to. Optional so existing plan-scoped consumers
   * are unaffected; the patient progress endpoint groups sessions by this field.
   */
  patientName?: string;
  /** ISO-8601 timestamp of when the session occurred. */
  date: string;
  /**
   * Lifecycle status. Absent on legacy/review records (treated as completed by
   * the review screens); the player writes `in_progress` on create and
   * `completed` on finalise.
   */
  status?: SessionStatus;
  /** ISO-8601 timestamp the session was created (Start). */
  startedAt?: string;
  /** ISO-8601 timestamp the session was finalised, set only once completed. */
  completedAt?: string;
  /** Persisted completion percentage (0–100). */
  completionPct: number;
  /** Persisted average form score (0–100), or null when unmeasured. */
  avgForm: number | null;
  /** Per-exercise breakdown backing the drill-down panel. */
  exercises: ExerciseResult[];
}

/** One point in a chart-ready progress series. Metrics may be absent (partial data). */
export interface ProgressPoint {
  /** ISO-8601 timestamp for the x-axis. */
  date: string;
  /** Total reps recorded on this date. */
  reps?: number | null;
  /** Average form score (0–100) on this date. */
  form?: number | null;
  /** Range-of-motion (degrees) on this date. */
  rom?: number | null;
}

/**
 * Chart-ready progress series for a plan, returned by the patient progress
 * endpoint. The dashboard trend chart renders directly from `series`.
 */
export interface PatientProgress {
  planId: string;
  series: ProgressPoint[];
}

/**
 * One dated sample in a per-exercise progress series. Values are aggregated
 * from the underlying session records for that exercise on that date so the
 * doctor dashboard can plot trends directly.
 */
export interface ProgressSeriesPoint {
  /** `YYYY-MM-DD` day the sample was recorded (from the session date). */
  date: string;
  /** Total reps the patient completed for this exercise on this date. */
  completedReps: number;
  /** Mean form score (0–100) across this date's records, or null if unmeasured. */
  avgFormScore: number | null;
  /** Best range-of-motion (degrees) reached on this date, or null if unmeasured. */
  maxRom: number | null;
}

/** A single exercise's date-ordered time series across a patient's sessions. */
export interface ExerciseProgress {
  /** Stable exercise id (matches the plan/exercise catalogue). */
  exerciseId: string;
  /** Human-readable exercise name. */
  name: string;
  /** Samples ordered oldest-first by date. */
  points: ProgressSeriesPoint[];
}

/**
 * Chart-ready progress-over-time report for one patient, returned by
 * `GET /api/patients/:name/progress`. A patient with no sessions yields an
 * empty `exercises` array (and a null adherence) rather than an error.
 */
export interface PatientProgressReport {
  /** Patient the report was aggregated for. */
  patientName: string;
  /** Per-exercise time series, sorted by exercise name. Empty when no sessions. */
  exercises: ExerciseProgress[];
  /**
   * Overall adherence: completed reps versus assigned (plan target) reps across
   * all of the patient's sessions, as a 0–100 percentage. Null when nothing was
   * assigned (e.g. the patient has no sessions).
   */
  adherencePct: number | null;
}

/**
 * Lifecycle of a persisted session record as the write APIs see it.
 *
 * - `in_progress` — created by `POST /api/sessions`; results are still being
 *   appended via PATCH.
 * - `completed`   — finalised by a PATCH that set `completedAt`; terminal.
 * - `abandoned`   — the patient stopped early; a PATCH may finalise it with
 *   partial results. Terminal.
 */
export type SessionRecordStatus = 'in_progress' | 'completed' | 'abandoned';

/**
 * One exercise's recorded result inside a {@link SessionRecord}.
 *
 * This is the authoritative per-exercise shape the write APIs persist (distinct
 * from {@link ExerciseResult}, the review dashboard's read projection). Numeric
 * fields are normalised by the store: `avgFormScore` is clamped to 0–100 and the
 * counts/measurements are clamped to be non-negative.
 */
export interface SessionResult {
  /** Stable exercise id (matches the plan/exercise catalogue); the merge key. */
  exerciseId: string;
  /** Reps the plan asked for (>= 0). */
  targetReps: number;
  /** Reps the patient actually completed (>= 0). */
  completedReps: number;
  /** Average form score for this exercise, clamped to 0–100. */
  avgFormScore: number;
  /** Best range-of-motion (degrees) reached this exercise (>= 0). */
  maxRangeOfMotionDeg: number;
  /** Wall-clock seconds spent on this exercise (>= 0). */
  durationSeconds: number;
}

/**
 * The authoritative persisted session, as returned by `GET /api/sessions/:id`
 * and `GET /api/sessions?planId=` and written by `POST`/`PATCH /api/sessions`.
 *
 * The server owns the lifecycle timestamps: `startedAt` is set on create and
 * `completedAt` only once the session is finalised (`completed`/`abandoned`).
 * `results` are merged per `exerciseId` across PATCH calls.
 */
export interface SessionRecord {
  /** Server-assigned id. */
  id: string;
  /** Plan the session belongs to (validated to exist on create). */
  planId: string;
  /** Patient the session is for. */
  patientName: string;
  /** ISO-8601 timestamp the session was opened; server-set on create. */
  startedAt: string;
  /** ISO-8601 timestamp the session was finalised; absent while in progress. */
  completedAt?: string;
  /** Lifecycle status. */
  status: SessionRecordStatus;
  /** Per-exercise results, merged by `exerciseId`. */
  results: SessionResult[];
}
