import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatPercent,
  formatScore,
  isExerciseComplete,
  sortSessionsNewestFirst,
  summariseSession,
} from '../../src/lib/sessionSummary';
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
    date: '2024-01-01T10:00:00Z',
    completionPct: 80,
    avgForm: 85,
    exercises: [makeExercise()],
    ...overrides,
  };
}

describe('sortSessionsNewestFirst', () => {
  it('orders sessions newest-first by date', () => {
    const sorted = sortSessionsNewestFirst([
      makeSession({ id: 'old', date: '2024-01-01T00:00:00Z' }),
      makeSession({ id: 'new', date: '2024-03-01T00:00:00Z' }),
      makeSession({ id: 'mid', date: '2024-02-01T00:00:00Z' }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['new', 'mid', 'old']);
  });

  it('does not mutate the input array', () => {
    const input = [
      makeSession({ id: 'a', date: '2024-01-01T00:00:00Z' }),
      makeSession({ id: 'b', date: '2024-02-01T00:00:00Z' }),
    ];
    const copy = [...input];
    sortSessionsNewestFirst(input);
    expect(input).toEqual(copy);
  });

  it('sorts records with invalid dates last', () => {
    const sorted = sortSessionsNewestFirst([
      makeSession({ id: 'bad', date: 'not-a-date' }),
      makeSession({ id: 'good', date: '2024-01-01T00:00:00Z' }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['good', 'bad']);
  });
});

describe('summariseSession', () => {
  it('derives done/skipped counts and passes through persisted values', () => {
    const summary = summariseSession(
      makeSession({
        completionPct: 66,
        avgForm: 74,
        exercises: [
          makeExercise({ exerciseId: 'a', skipped: false }),
          makeExercise({ exerciseId: 'b', skipped: true }),
          makeExercise({ exerciseId: 'c', skipped: false }),
        ],
      }),
    );
    expect(summary.completionPct).toBe(66);
    expect(summary.avgForm).toBe(74);
    expect(summary.doneCount).toBe(2);
    expect(summary.skippedCount).toBe(1);
    expect(summary.totalCount).toBe(3);
  });
});

describe('isExerciseComplete', () => {
  it('is true when completed reps meet or exceed target', () => {
    expect(isExerciseComplete(makeExercise({ completedReps: 10, targetReps: 10 }))).toBe(true);
    expect(isExerciseComplete(makeExercise({ completedReps: 12, targetReps: 10 }))).toBe(true);
  });

  it('is false when under target or skipped', () => {
    expect(isExerciseComplete(makeExercise({ completedReps: 5, targetReps: 10 }))).toBe(false);
    expect(isExerciseComplete(makeExercise({ skipped: true }))).toBe(false);
  });
});

describe('formatters', () => {
  it('formats scores and percentages, em dash for null', () => {
    expect(formatScore(88.4)).toBe('88');
    expect(formatScore(null)).toBe('—');
    expect(formatPercent(80)).toBe('80%');
    expect(formatPercent(null)).toBe('—');
  });

  it('formats ISO dates as YYYY-MM-DD and passes through unparseable input', () => {
    expect(formatDate('2024-03-05T12:00:00Z')).toBe('2024-03-05');
    expect(formatDate('whatever')).toBe('whatever');
  });
});
