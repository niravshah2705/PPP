/**
 * Pure glue between a persisted {@link Plan} and the session player: it turns a
 * plan's dosage items into the sequencer's exercise list and decides whether a
 * reopened plan has an in-progress session to resume.
 *
 * Kept free of React/I/O so the ordering and resume rules are unit-testable and
 * shared by the patient route.
 */

import type { Plan } from '../types/plan';
import type { Session } from '../types/session';
import type { SequencerExercise } from './sessionSequencer';

/**
 * Map a plan's items to the sequencer's exercise list, in play order.
 *
 * Items are ordered by their explicit `order` when present (falling back to
 * array position), matching how the builder persists sequence. Each item's
 * `reps` become the set's target and `rest` the between-set rest; the sequencer
 * coerces out-of-range dosage, so no clamping is needed here.
 */
export function planToSequencerExercises(plan: Plan): SequencerExercise[] {
  return plan.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const oa = a.item.order ?? a.index;
      const ob = b.item.order ?? b.index;
      return oa - ob;
    })
    .map(({ item }) => ({
      exerciseId: item.exerciseId,
      targetReps: item.reps,
      sets: item.sets,
      restSec: item.rest,
    }));
}

/**
 * The session a reopened plan should offer to resume, or null when there is
 * none. A session is resumable when it is explicitly `in_progress` (a tab closed
 * mid-session leaves it there). If several are in progress, the most recently
 * started/dated one wins so the patient continues their latest attempt.
 */
export function findResumableSession(sessions: readonly Session[]): Session | null {
  const inProgress = sessions.filter((s) => s.status === 'in_progress');
  if (inProgress.length === 0) return null;
  return [...inProgress].sort(
    (a, b) => startTimestamp(b) - startTimestamp(a),
  )[0];
}

function startTimestamp(session: Session): number {
  const raw = session.startedAt ?? session.date;
  const t = Date.parse(raw ?? '');
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}
