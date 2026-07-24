import { describe, expect, it } from 'vitest';
import { EXERCISE_CATALOG, indexExercisesById } from '../../src/server/fixtures/exercises';
import { PLAN_TEMPLATES } from '../../src/server/fixtures/planTemplates';
import {
  assertTemplatesReferenceKnownExercises,
  findMissingExerciseReferences,
} from '../../src/server/templateIntegrity';
import { ITEM_BOUNDS } from '../../src/lib/templateValidation';

describe('plan template seed data', () => {
  it('provides at least 4 curated templates', () => {
    expect(PLAN_TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  it('gives every template an id, name, description and non-empty items[]', () => {
    for (const template of PLAN_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(Array.isArray(template.items)).toBe(true);
      expect(template.items.length).toBeGreaterThan(0);
    }
  });

  it('uses unique template ids', () => {
    const ids = PLAN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every item dosage within the shared plan bounds', () => {
    for (const template of PLAN_TEMPLATES) {
      for (const item of template.items) {
        expect(item.sets).toBeGreaterThanOrEqual(ITEM_BOUNDS.sets.min);
        expect(item.sets).toBeLessThanOrEqual(ITEM_BOUNDS.sets.max);
        expect(item.reps).toBeGreaterThanOrEqual(ITEM_BOUNDS.reps.min);
        expect(item.reps).toBeLessThanOrEqual(ITEM_BOUNDS.reps.max);
        expect(item.holdSeconds).toBeGreaterThanOrEqual(ITEM_BOUNDS.hold.min);
        expect(item.holdSeconds).toBeLessThanOrEqual(ITEM_BOUNDS.hold.max);
        expect(item.restSeconds).toBeGreaterThanOrEqual(ITEM_BOUNDS.rest.min);
        expect(item.restSeconds).toBeLessThanOrEqual(ITEM_BOUNDS.rest.max);
      }
    }
  });
});

describe('exercise reference integrity', () => {
  it('references only exercises that exist in the catalogue', () => {
    expect(findMissingExerciseReferences()).toEqual([]);
  });

  it('does not throw when asserting seed integrity', () => {
    expect(() => assertTemplatesReferenceKnownExercises()).not.toThrow();
  });

  it('detects and reports a dangling reference', () => {
    const broken = [
      {
        id: 'broken',
        name: 'Broken',
        description: 'references a missing exercise',
        items: [
          { exerciseId: 'knee-flexion', sets: 1, reps: 1, holdSeconds: 0, restSeconds: 0 },
          { exerciseId: 'does-not-exist', sets: 1, reps: 1, holdSeconds: 0, restSeconds: 0 },
        ],
      },
    ];
    const missing = findMissingExerciseReferences(broken, EXERCISE_CATALOG);
    expect(missing).toEqual([{ templateId: 'broken', index: 1, exerciseId: 'does-not-exist' }]);
    expect(() => assertTemplatesReferenceKnownExercises(broken, EXERCISE_CATALOG)).toThrow(
      /does-not-exist/,
    );
  });

  it('has a catalogue indexable by unique id', () => {
    const index = indexExercisesById();
    expect(index.size).toBe(EXERCISE_CATALOG.length);
  });
});
