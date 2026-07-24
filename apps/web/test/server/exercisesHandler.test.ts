import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseCategory } from '../../src/types/exercise';
import { EXERCISE_CATEGORIES } from '../../src/types/exercise';
import type { ErrorEnvelope } from '../../src/types/errorEnvelope';
import {
  EXERCISE_NOT_FOUND_CODE,
  handleGetExercise,
  handleListExercises,
} from '../../src/server/exercisesHandler';
import { EXERCISE_CATALOG } from '../../src/server/fixtures/exercises';

/** The 12 exercises the ticket requires the seeded library to contain. */
const REQUIRED_EXERCISE_IDS = [
  'squat',
  'sit-to-stand',
  'shoulder-abduction',
  'knee-extension',
  'arm-raise',
  'hip-abduction',
  'heel-raise',
  'elbow-flexion',
  'neck-rotation',
  'ankle-dorsiflexion',
  'standing-march',
  'wall-push-up',
] as const;

const sample: Exercise[] = [
  {
    id: 'up-1',
    name: 'Arm Thing',
    category: 'upper',
    demoMediaRef: 'media/up-1.mp4',
    defaultSets: 3,
    defaultReps: 10,
    defaultHoldSeconds: 0,
    targetJoints: ['shoulder'],
    tracking: { landmarks: [23, 11, 13], angleJoint: { from: 23, vertex: 11, to: 13 }, repUpAngle: 150, repDownAngle: 20 },
  },
  {
    id: 'low-1',
    name: 'Leg Thing',
    category: 'lower',
    demoMediaRef: 'media/low-1.mp4',
    defaultSets: 3,
    defaultReps: 12,
    defaultHoldSeconds: 0,
    targetJoints: ['knee'],
    tracking: { landmarks: [23, 25, 27], angleJoint: { from: 23, vertex: 25, to: 27 }, repUpAngle: 170, repDownAngle: 90 },
  },
];

describe('seeded exercise library (exercises.json)', () => {
  it('provides at least 12 exercises', () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(12);
  });

  it('includes every exercise named in the ticket', () => {
    const ids = new Set(EXERCISE_CATALOG.map((e) => e.id));
    for (const id of REQUIRED_EXERCISE_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('uses unique ids', () => {
    const ids = EXERCISE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every record a complete, non-null tracking config and defaults', () => {
    for (const exercise of EXERCISE_CATALOG) {
      expect(exercise.id).toBeTruthy();
      expect(exercise.name).toBeTruthy();
      expect(exercise.description).toBeTruthy();
      expect(exercise.demoMediaRef).toBeTruthy();

      // Category is drawn from the documented vocabulary.
      expect(EXERCISE_CATEGORIES).toContain(exercise.category as ExerciseCategory);

      // targetJoints[] is present and non-empty.
      expect(Array.isArray(exercise.targetJoints)).toBe(true);
      expect(exercise.targetJoints?.length ?? 0).toBeGreaterThan(0);

      // Defaults are present (non-null numbers).
      expect(typeof exercise.defaultSets).toBe('number');
      expect(typeof exercise.defaultReps).toBe('number');
      expect(typeof exercise.defaultHoldSeconds).toBe('number');

      // Tracking config is complete and non-null.
      const tracking = exercise.tracking;
      expect(tracking).toBeTruthy();
      expect(Array.isArray(tracking?.landmarks)).toBe(true);
      expect(tracking?.landmarks?.length ?? 0).toBeGreaterThan(0);
      expect(tracking?.angleJoint).toBeTruthy();
      expect(typeof tracking?.angleJoint.from).toBe('number');
      expect(typeof tracking?.angleJoint.vertex).toBe('number');
      expect(typeof tracking?.angleJoint.to).toBe('number');
      expect(typeof tracking?.repUpAngle).toBe('number');
      expect(typeof tracking?.repDownAngle).toBe('number');

      // The angle joint's three points are among the declared landmarks.
      const landmarks = new Set(tracking?.landmarks ?? []);
      expect(landmarks.has(tracking!.angleJoint.from)).toBe(true);
      expect(landmarks.has(tracking!.angleJoint.vertex)).toBe(true);
      expect(landmarks.has(tracking!.angleJoint.to)).toBe(true);
    }
  });
});

describe('handleListExercises (GET /api/exercises)', () => {
  it('returns 200 with the full catalogue when no category is given', () => {
    const res = handleListExercises();
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(EXERCISE_CATALOG.length);
    expect(res.body.length).toBeGreaterThanOrEqual(12);
  });

  it('does not expose the underlying array (returns a copy)', () => {
    const res = handleListExercises({}, { exercises: sample });
    expect(res.body).not.toBe(sample);
    expect(res.body).toEqual(sample);
  });

  it('filters by category (case-insensitively) returning only matches', () => {
    const res = handleListExercises({ category: 'UPPER' }, { exercises: sample });
    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.id)).toEqual(['up-1']);
  });

  it('returns [] with 200 for an unknown/invalid category (not an error)', () => {
    const res = handleListExercises({ category: 'not-a-category' }, { exercises: sample });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('treats a blank category the same as no filter', () => {
    const res = handleListExercises({ category: '   ' }, { exercises: sample });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(sample.length);
  });

  it('every seeded category yields a non-empty match', () => {
    for (const category of EXERCISE_CATEGORIES) {
      const present = EXERCISE_CATALOG.some((e) => e.category === category);
      const res = handleListExercises({ category });
      if (present) {
        expect(res.body.length).toBeGreaterThan(0);
        for (const e of res.body) expect(e.category).toBe(category);
      }
    }
  });
});

describe('handleGetExercise (GET /api/exercises/:id)', () => {
  it('returns 200 with the correct record for a known id', () => {
    const res = handleGetExercise('knee-extension');
    expect(res.status).toBe(200);
    const body = res.body as Exercise;
    expect(body.id).toBe('knee-extension');
    expect(body.tracking).toBeTruthy();
  });

  it('returns 404 with a JSON error envelope for an unknown id', () => {
    const res = handleGetExercise('does-not-exist');
    expect(res.status).toBe(404);
    const body = res.body as ErrorEnvelope;
    expect(body.error).toBeTruthy();
    expect(body.error.code).toBe(EXERCISE_NOT_FOUND_CODE);
    expect(body.error.message).toContain('does-not-exist');
  });

  it('resolves against injected data', () => {
    const res = handleGetExercise('up-1', { exercises: sample });
    expect(res.status).toBe(200);
    expect((res.body as Exercise).id).toBe('up-1');
  });
});
