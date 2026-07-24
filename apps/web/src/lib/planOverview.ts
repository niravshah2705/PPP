/**
 * Pure view-model for the patient's read-only plan overview (NIR-765).
 *
 * It projects a patient-facing {@link SharedPlan} into exactly what the overview
 * screen renders — patient name, an ordered exercise list with a human-readable
 * `sets × reps/hold` dosage and per-exercise guidance notes, plus an estimated
 * total duration — without any React/I/O, so the ordering, dosage wording, and
 * duration maths are unit-testable and shared. Duration is derived from each
 * item's sets/reps/hold/rest via the existing {@link estimateItemDurationSeconds}
 * helper, keeping the patient overview and the doctor builder in agreement.
 */

import type { SharedPlan, SharedPlanItem } from '../types/sharedPlan';
import {
  estimateItemDurationSeconds,
  estimatePlanDurationSeconds,
  formatPlanDuration,
} from './planDraft';

/** One row of the overview: an exercise with its dosage, note, and duration. */
export interface PlanOverviewItem {
  exerciseId: string;
  name: string;
  /** Guidance shown to the patient — the exercise's description, when present. */
  note?: string;
  /** Category tag (e.g. "knee"), when the exercise carries one. */
  category?: string;
  /** True when the movement is a timed hold rather than counted reps. */
  isHold: boolean;
  sets: number;
  reps: number;
  holdSeconds: number;
  restSeconds: number;
  /** Human-readable target: `3 × 10 reps` or `3 × 5s hold`. */
  dosageLabel: string;
  /** This item's estimated duration, in seconds. */
  durationSeconds: number;
}

/** The full, presentation-ready overview model for a shared plan. */
export interface PlanOverviewModel {
  planId: string;
  patientName: string;
  /** Exercises in play order. */
  items: PlanOverviewItem[];
  /** Number of exercises assigned (0 → "no exercises assigned"). */
  exerciseCount: number;
  totalDurationSeconds: number;
  /** `Xm Ys` (or `Ys` under a minute) — see {@link formatPlanDuration}. */
  totalDurationLabel: string;
}

/**
 * Format an item's dosage as the ticket's `sets × reps/hold` line. A movement
 * with a positive hold is a timed hold (`3 × 5s hold`); otherwise it is a rep
 * target (`3 × 10 reps`), pluralised for a single rep.
 */
export function formatItemDosage(
  item: Pick<SharedPlanItem, 'sets' | 'reps' | 'hold'>,
): string {
  const sets = Math.max(0, Math.trunc(item.sets));
  if (item.hold > 0) {
    return `${sets} × ${item.hold}s hold`;
  }
  const reps = Math.max(0, Math.trunc(item.reps));
  return `${sets} × ${reps} rep${reps === 1 ? '' : 's'}`;
}

/**
 * Build the overview model from a shared plan. Items follow the plan's explicit
 * `order` (falling back to array position), matching how the builder persists
 * sequence and how the session player walks the plan.
 */
export function buildPlanOverview(plan: SharedPlan): PlanOverviewModel {
  const items = plan.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const oa = a.item.order ?? a.index;
      const ob = b.item.order ?? b.index;
      return oa - ob;
    })
    .map(({ item }) => toOverviewItem(item));

  const totalDurationSeconds = estimatePlanDurationSeconds(plan.items);

  return {
    planId: plan.id,
    patientName: plan.patientName,
    items,
    exerciseCount: items.length,
    totalDurationSeconds,
    totalDurationLabel: formatPlanDuration(totalDurationSeconds),
  };
}

function toOverviewItem(item: SharedPlanItem): PlanOverviewItem {
  const note = item.exercise.description?.trim();
  return {
    exerciseId: item.exerciseId,
    name: item.exercise.name,
    note: note ? note : undefined,
    category: item.exercise.category,
    isHold: item.hold > 0,
    sets: item.sets,
    reps: item.reps,
    holdSeconds: item.hold,
    restSeconds: item.rest,
    dosageLabel: formatItemDosage(item),
    durationSeconds: estimateItemDurationSeconds(item),
  };
}
