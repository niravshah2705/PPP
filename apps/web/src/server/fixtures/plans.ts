import type { Plan } from '../../types/plan';

/**
 * Seeded plans — the persisted prescriptions the read handlers resolve.
 *
 * These carry the full stored {@link Plan} shape (including editing-only/internal
 * metadata such as `templateId`/`templateName` and `createdAt`/`updatedAt`) so
 * the share handler has something realistic to strip down into the patient-facing
 * payload. Every `exerciseId` must resolve to an entry in `EXERCISE_CATALOG`;
 * items referencing a missing exercise are filtered (and logged) during share
 * expansion, mirroring template expansion.
 */
export const SEED_PLANS: readonly Plan[] = [
  {
    id: 'plan-ada-knee',
    patientName: 'Ada Lovelace',
    templateId: 'post-op-knee-week-1',
    templateName: 'Post-op Knee Week 1',
    createdAt: '2024-05-20T09:00:00.000Z',
    updatedAt: '2024-05-22T14:30:00.000Z',
    items: [
      { exerciseId: 'quad-set', sets: 3, reps: 10, hold: 5, rest: 30, order: 0 },
      { exerciseId: 'heel-slide', sets: 3, reps: 10, hold: 0, rest: 30, order: 1 },
      { exerciseId: 'straight-leg-raise', sets: 3, reps: 8, hold: 3, rest: 45, order: 2 },
    ],
  },
  {
    id: 'plan-grace-shoulder',
    patientName: 'Grace Hopper',
    templateId: 'shoulder-mobility',
    templateName: 'Shoulder Mobility',
    createdAt: '2024-06-01T08:15:00.000Z',
    updatedAt: '2024-06-03T11:45:00.000Z',
    items: [
      { exerciseId: 'shoulder-pendulum', sets: 2, reps: 15, hold: 0, rest: 30, order: 0 },
      { exerciseId: 'wall-slide', sets: 3, reps: 10, hold: 2, rest: 45, order: 1 },
      { exerciseId: 'scapular-retraction', sets: 3, reps: 10, hold: 5, rest: 30, order: 2 },
    ],
  },
];
