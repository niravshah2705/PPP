import type { ExerciseResult, Session } from '../types/session';

/** Compact, display-ready summary of a single session for the list row. */
export interface SessionSummary {
  id: string;
  date: string;
  /** Persisted completion percentage (0–100), rendered verbatim. */
  completionPct: number;
  /** Persisted average form (0–100) or null when unmeasured. */
  avgForm: number | null;
  /** Count of exercises the patient completed (did not skip). */
  doneCount: number;
  /** Count of exercises the patient skipped. */
  skippedCount: number;
  /** Total exercises prescribed in the session. */
  totalCount: number;
}

/**
 * Return sessions sorted newest-first by `date`. Pure (does not mutate the
 * input array). Invalid/unparseable dates sort last so a bad record never hides
 * good ones at the top of the list.
 */
export function sortSessionsNewestFirst(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((a, b) => timestamp(b.date) - timestamp(a.date));
}

function timestamp(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Build the list-row summary for one session (done/skipped are derived). */
export function summariseSession(session: Session): SessionSummary {
  let doneCount = 0;
  let skippedCount = 0;
  for (const ex of session.exercises) {
    if (ex.skipped) skippedCount += 1;
    else doneCount += 1;
  }
  return {
    id: session.id,
    date: session.date,
    completionPct: session.completionPct,
    avgForm: session.avgForm,
    doneCount,
    skippedCount,
    totalCount: session.exercises.length,
  };
}

/**
 * True when an exercise met or exceeded its prescribed reps. Used by the
 * drill-down to flag completed vs target at a glance.
 */
export function isExerciseComplete(ex: ExerciseResult): boolean {
  return !ex.skipped && ex.targetReps > 0 && ex.completedReps >= ex.targetReps;
}

/** Format a 0–100 score for display, or an em dash when null/undefined. */
export function formatScore(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}`;
}

/** Format a percentage for display (e.g. `82%`). */
export function formatPercent(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}%`;
}

/** Format an ISO date as a short, locale-independent `YYYY-MM-DD` label. */
export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toISOString().slice(0, 10);
}
