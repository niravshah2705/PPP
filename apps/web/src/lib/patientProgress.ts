import type {
  ExerciseProgress,
  PatientProgressReport,
  ProgressSeriesPoint,
  Session,
} from '../types/session';
import { formatDate } from './sessionSummary';

/**
 * Aggregate a patient's sessions into the chart-ready progress report served by
 * `GET /api/patients/:name/progress`.
 *
 * This is the endpoint's handler core: it takes the raw session records (the
 * store queried by patient) and produces the compact structure the doctor
 * dashboard renders without any further client-side aggregation.
 *
 * Behaviour (mirrors the acceptance criteria):
 * - Patient matching is case-insensitive and whitespace-trimmed.
 * - Records are grouped by exercise and by day (`YYYY-MM-DD`). For each
 *   exercise/day the point's `completedReps` sums the records, `avgFormScore` is
 *   the mean of the measured form scores (null when none), and `maxRom` is the
 *   best measured range-of-motion (null when none). With one record per day the
 *   point equals that record exactly.
 * - `adherencePct` is total completed reps over total assigned (plan target)
 *   reps across every matched session, as a 0–100 percentage. It is null when
 *   nothing was assigned (including the no-sessions case).
 * - A patient with no matching sessions yields an empty `exercises` array — the
 *   caller returns it with HTTP 200 rather than erroring.
 *
 * Pure: does not mutate the input.
 */
export function aggregatePatientProgress(
  patientName: string,
  sessions: readonly Session[],
): PatientProgressReport {
  const target = normaliseName(patientName);

  // Per exercise → per date accumulator.
  const exercises = new Map<string, ExerciseAccumulator>();
  let assignedReps = 0;
  let completedReps = 0;

  for (const session of sessions) {
    if (normaliseName(session.patientName ?? '') !== target) continue;
    const date = formatDate(session.date);

    for (const ex of session.exercises) {
      assignedReps += safeCount(ex.targetReps);
      completedReps += safeCount(ex.completedReps);

      let acc = exercises.get(ex.exerciseId);
      if (!acc) {
        acc = { exerciseId: ex.exerciseId, name: ex.name, byDate: new Map() };
        exercises.set(ex.exerciseId, acc);
      }
      // A later, non-empty name wins so the series stays labelled if an early
      // record happened to omit it.
      if (!acc.name && ex.name) acc.name = ex.name;

      let point = acc.byDate.get(date);
      if (!point) {
        point = { completedReps: 0, formSum: 0, formCount: 0, maxRom: null };
        acc.byDate.set(date, point);
      }
      point.completedReps += safeCount(ex.completedReps);
      if (ex.avgForm != null && Number.isFinite(ex.avgForm)) {
        point.formSum += ex.avgForm;
        point.formCount += 1;
      }
      if (ex.maxRom != null && Number.isFinite(ex.maxRom)) {
        point.maxRom = point.maxRom == null ? ex.maxRom : Math.max(point.maxRom, ex.maxRom);
      }
    }
  }

  const series: ExerciseProgress[] = [...exercises.values()]
    .map((acc) => ({
      exerciseId: acc.exerciseId,
      name: acc.name,
      points: [...acc.byDate.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, p]): ProgressSeriesPoint => ({
          date,
          completedReps: p.completedReps,
          avgFormScore: p.formCount > 0 ? p.formSum / p.formCount : null,
          maxRom: p.maxRom,
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.exerciseId.localeCompare(b.exerciseId));

  return {
    patientName,
    exercises: series,
    adherencePct: assignedReps > 0 ? (completedReps / assignedReps) * 100 : null,
  };
}

interface DateAccumulator {
  completedReps: number;
  formSum: number;
  formCount: number;
  maxRom: number | null;
}

interface ExerciseAccumulator {
  exerciseId: string;
  name: string;
  byDate: Map<string, DateAccumulator>;
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

/** Coerce a rep count to a non-negative finite number (bad data contributes 0). */
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
