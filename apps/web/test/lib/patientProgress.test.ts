import { describe, expect, it } from 'vitest';
import { aggregatePatientProgress } from '../../src/lib/patientProgress';
import type { ExerciseResult, Session } from '../../src/types/session';

function makeExercise(overrides: Partial<ExerciseResult> = {}): ExerciseResult {
  return {
    exerciseId: 'ex1',
    name: 'Knee Raise',
    targetReps: 10,
    completedReps: 10,
    avgForm: 88,
    maxRom: 120,
    skipped: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    planId: 'p1',
    patientName: 'Ada Lovelace',
    date: '2024-01-01T10:00:00Z',
    completionPct: 80,
    avgForm: 85,
    exercises: [makeExercise()],
    ...overrides,
  };
}

describe('aggregatePatientProgress', () => {
  it('returns empty exercises and null adherence for a patient with no sessions', () => {
    const report = aggregatePatientProgress('Nobody', [makeSession()]);
    expect(report).toEqual({ patientName: 'Nobody', exercises: [], adherencePct: null });
  });

  it('returns empty exercises when the session store is empty', () => {
    const report = aggregatePatientProgress('Ada Lovelace', []);
    expect(report.exercises).toEqual([]);
    expect(report.adherencePct).toBeNull();
  });

  it('matches the patient name case-insensitively and ignoring surrounding whitespace', () => {
    const report = aggregatePatientProgress('  ADA lovelace ', [makeSession()]);
    expect(report.exercises).toHaveLength(1);
    expect(report.exercises[0].points).toHaveLength(1);
  });

  it('builds a per-exercise time series whose values match the session records', () => {
    const sessions = [
      makeSession({
        id: 's1',
        date: '2024-01-01T10:00:00Z',
        exercises: [makeExercise({ completedReps: 8, avgForm: 70, maxRom: 100 })],
      }),
      makeSession({
        id: 's2',
        date: '2024-01-03T09:00:00Z',
        exercises: [makeExercise({ completedReps: 10, avgForm: 90, maxRom: 130 })],
      }),
    ];
    const report = aggregatePatientProgress('Ada Lovelace', sessions);
    expect(report.exercises).toHaveLength(1);
    expect(report.exercises[0]).toMatchObject({ exerciseId: 'ex1', name: 'Knee Raise' });
    expect(report.exercises[0].points).toEqual([
      { date: '2024-01-01', completedReps: 8, avgFormScore: 70, maxRom: 100 },
      { date: '2024-01-03', completedReps: 10, avgFormScore: 90, maxRom: 130 },
    ]);
  });

  it('orders each exercise series oldest-first regardless of input order', () => {
    const sessions = [
      makeSession({ id: 's2', date: '2024-02-01T00:00:00Z', exercises: [makeExercise({ completedReps: 5 })] }),
      makeSession({ id: 's1', date: '2024-01-01T00:00:00Z', exercises: [makeExercise({ completedReps: 3 })] }),
    ];
    const report = aggregatePatientProgress('Ada Lovelace', sessions);
    expect(report.exercises[0].points.map((p) => p.date)).toEqual(['2024-01-01', '2024-02-01']);
  });

  it('separates and sorts multiple exercises by name', () => {
    const sessions = [
      makeSession({
        exercises: [
          makeExercise({ exerciseId: 'sq', name: 'Squat' }),
          makeExercise({ exerciseId: 'kr', name: 'Ankle Pump' }),
        ],
      }),
    ];
    const report = aggregatePatientProgress('Ada Lovelace', sessions);
    expect(report.exercises.map((e) => e.name)).toEqual(['Ankle Pump', 'Squat']);
  });

  it('groups records for the same exercise on the same day: sums reps, means form, maxes ROM', () => {
    const sessions = [
      makeSession({
        id: 's1',
        date: '2024-01-01T08:00:00Z',
        exercises: [makeExercise({ completedReps: 6, avgForm: 60, maxRom: 100 })],
      }),
      makeSession({
        id: 's2',
        date: '2024-01-01T20:00:00Z',
        exercises: [makeExercise({ completedReps: 4, avgForm: 80, maxRom: 140 })],
      }),
    ];
    const report = aggregatePatientProgress('Ada Lovelace', sessions);
    expect(report.exercises[0].points).toEqual([
      { date: '2024-01-01', completedReps: 10, avgFormScore: 70, maxRom: 140 },
    ]);
  });

  it('leaves avgFormScore/maxRom null when unmeasured (e.g. skipped) but still counts reps', () => {
    const sessions = [
      makeSession({
        exercises: [makeExercise({ completedReps: 0, avgForm: null, maxRom: null, skipped: true })],
      }),
    ];
    const report = aggregatePatientProgress('Ada Lovelace', sessions);
    expect(report.exercises[0].points).toEqual([
      { date: '2024-01-01', completedReps: 0, avgFormScore: null, maxRom: null },
    ]);
  });

  it('computes overall adherence as completed vs assigned reps across all sessions', () => {
    const sessions = [
      makeSession({
        id: 's1',
        exercises: [
          makeExercise({ exerciseId: 'a', targetReps: 10, completedReps: 8 }),
          makeExercise({ exerciseId: 'b', targetReps: 10, completedReps: 5 }),
        ],
      }),
      makeSession({
        id: 's2',
        date: '2024-01-02T00:00:00Z',
        exercises: [makeExercise({ exerciseId: 'a', targetReps: 20, completedReps: 15 })],
      }),
    ];
    // completed 8+5+15 = 28, assigned 10+10+20 = 40 -> 70%
    const report = aggregatePatientProgress('Ada Lovelace', sessions);
    expect(report.adherencePct).toBeCloseTo(70, 10);
  });

  it('ignores sessions belonging to other patients', () => {
    const sessions = [
      makeSession({ id: 'mine', patientName: 'Ada Lovelace', exercises: [makeExercise({ completedReps: 9 })] }),
      makeSession({ id: 'other', patientName: 'Alan Turing', exercises: [makeExercise({ completedReps: 1 })] }),
    ];
    const report = aggregatePatientProgress('Ada Lovelace', sessions);
    expect(report.exercises[0].points).toEqual([
      { date: '2024-01-01', completedReps: 9, avgFormScore: 88, maxRom: 120 },
    ]);
  });

  it('does not mutate the input sessions', () => {
    const sessions = [makeSession()];
    const snapshot = JSON.parse(JSON.stringify(sessions));
    aggregatePatientProgress('Ada Lovelace', sessions);
    expect(sessions).toEqual(snapshot);
  });
});
