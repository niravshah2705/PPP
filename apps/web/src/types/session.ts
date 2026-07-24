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
 * A single completed session for a plan. `completionPct` and `avgForm` are the
 * persisted, authoritative values — the dashboard renders them verbatim.
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
