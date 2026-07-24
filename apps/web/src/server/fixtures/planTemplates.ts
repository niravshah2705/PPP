import type { PlanTemplate } from '../../types/planTemplate';

/**
 * Seeded plan templates — curated bundles a doctor can start a plan from.
 *
 * Every `exerciseId` here must resolve to an entry in `EXERCISE_CATALOG`; the
 * integrity check (`assertTemplatesReferenceKnownExercises`) fails the build/test
 * if a template references a missing exercise, and dosage values stay within the
 * shared `ITEM_BOUNDS` used by the plan builder.
 */
export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    id: 'post-op-knee-week-1',
    name: 'Post-op Knee Week 1',
    description:
      'Gentle early-stage protocol to restore range and quad activation the first week after knee surgery.',
    categoryTags: ['knee', 'post-op'],
    items: [
      { exerciseId: 'quad-set', sets: 3, reps: 10, holdSeconds: 5, restSeconds: 30 },
      { exerciseId: 'heel-slide', sets: 3, reps: 10, holdSeconds: 0, restSeconds: 30 },
      { exerciseId: 'knee-flexion', sets: 2, reps: 12, holdSeconds: 0, restSeconds: 45 },
      { exerciseId: 'straight-leg-raise', sets: 3, reps: 8, holdSeconds: 3, restSeconds: 45 },
    ],
  },
  {
    id: 'shoulder-mobility',
    name: 'Shoulder Mobility',
    description:
      'Progressive mobility work to ease a stiff shoulder back into a pain-free range.',
    categoryTags: ['shoulder', 'mobility'],
    items: [
      { exerciseId: 'shoulder-pendulum', sets: 2, reps: 15, holdSeconds: 0, restSeconds: 30 },
      { exerciseId: 'wall-slide', sets: 3, reps: 10, holdSeconds: 2, restSeconds: 45 },
      {
        exerciseId: 'shoulder-external-rotation',
        sets: 3,
        reps: 12,
        holdSeconds: 0,
        restSeconds: 45,
      },
      { exerciseId: 'scapular-retraction', sets: 3, reps: 10, holdSeconds: 5, restSeconds: 30 },
    ],
  },
  {
    id: 'lower-back-core',
    name: 'Lower-back Core',
    description:
      'Core-stability routine to protect and strengthen the lower back with controlled, low-load movements.',
    categoryTags: ['lower-back', 'core'],
    items: [
      { exerciseId: 'pelvic-tilt', sets: 2, reps: 12, holdSeconds: 3, restSeconds: 30 },
      { exerciseId: 'glute-bridge', sets: 3, reps: 12, holdSeconds: 3, restSeconds: 45 },
      { exerciseId: 'bird-dog', sets: 3, reps: 8, holdSeconds: 5, restSeconds: 45 },
      { exerciseId: 'dead-bug', sets: 3, reps: 10, holdSeconds: 0, restSeconds: 45 },
    ],
  },
  {
    id: 'general-balance',
    name: 'General Balance',
    description:
      'Foundational balance training to reduce fall risk and build steadiness on the feet.',
    categoryTags: ['balance', 'general'],
    items: [
      { exerciseId: 'single-leg-stance', sets: 3, reps: 3, holdSeconds: 20, restSeconds: 30 },
      { exerciseId: 'tandem-stance', sets: 3, reps: 2, holdSeconds: 30, restSeconds: 30 },
      { exerciseId: 'heel-toe-walk', sets: 2, reps: 10, holdSeconds: 0, restSeconds: 45 },
      { exerciseId: 'marching-in-place', sets: 2, reps: 20, holdSeconds: 0, restSeconds: 30 },
    ],
  },
  {
    id: 'post-op-knee-week-2',
    name: 'Post-op Knee Week 2',
    description:
      'Second-week progression adding controlled extension and endurance as swelling settles.',
    categoryTags: ['knee', 'post-op'],
    items: [
      { exerciseId: 'knee-extension', sets: 3, reps: 12, holdSeconds: 3, restSeconds: 45 },
      { exerciseId: 'straight-leg-raise', sets: 3, reps: 12, holdSeconds: 3, restSeconds: 45 },
      { exerciseId: 'heel-slide', sets: 3, reps: 15, holdSeconds: 0, restSeconds: 30 },
      { exerciseId: 'glute-bridge', sets: 3, reps: 10, holdSeconds: 3, restSeconds: 45 },
    ],
  },
];
