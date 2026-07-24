import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../src/types/exercise';
import type { Plan } from '../../src/types/plan';
import type { ErrorEnvelope } from '../../src/types/errorEnvelope';
import type { SharedPlan } from '../../src/types/sharedPlan';
import {
  PLAN_NOT_FOUND_CODE,
  expandPlanForShare,
  handleGetPlanShare,
} from '../../src/server/plansShareHandler';
import { SEED_PLANS } from '../../src/server/fixtures/plans';

const exercises: Exercise[] = [
  {
    id: 'ex-1',
    name: 'Exercise One',
    description: 'Do the thing',
    category: 'knee',
    accentColor: '#123456',
    demoMediaRef: 'media/ex-1.mp4',
    tracking: {
      angleJoint: { from: 1, vertex: 2, to: 3 },
      repUpAngle: 160,
      repDownAngle: 60,
    },
  },
  { id: 'ex-2', name: 'Exercise Two', thumbnailUrl: '/thumbs/ex-2.png' },
];

const plan: Plan = {
  id: 'p1',
  patientName: 'Ada Lovelace',
  templateId: 't1',
  templateName: 'Knee rehab',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-02-02T00:00:00.000Z',
  items: [
    { exerciseId: 'ex-1', sets: 3, reps: 10, hold: 5, rest: 30, order: 0 },
    { exerciseId: 'ex-2', sets: 2, reps: 12, hold: 0, rest: 45, order: 1 },
  ],
};

describe('handleGetPlanShare (GET /api/plans/:id/share)', () => {
  it('returns 200 with a patient-facing payload for a seeded plan', () => {
    const res = handleGetPlanShare(SEED_PLANS[0].id) as {
      status: number;
      body: SharedPlan;
    };
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SEED_PLANS[0].id);
    expect(res.body.patientName).toBe(SEED_PLANS[0].patientName);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.exercise.id).toBe(item.exerciseId);
      expect(item.exercise.name).toBeTruthy();
    }
  });

  it('strips editing-only/internal fields from the payload', () => {
    const res = handleGetPlanShare('p1', { plans: [plan], exercises }) as {
      status: number;
      body: SharedPlan;
    };
    expect(res.status).toBe(200);
    const body = res.body as SharedPlan & Record<string, unknown>;
    expect(body).not.toHaveProperty('templateId');
    expect(body).not.toHaveProperty('templateName');
    expect(body).not.toHaveProperty('createdAt');
    expect(body).not.toHaveProperty('updatedAt');
    expect(Object.keys(body).sort()).toEqual(['id', 'items', 'patientName']);
  });

  it('expands each item with its resolved exercise (dosage preserved)', () => {
    const res = handleGetPlanShare('p1', { plans: [plan], exercises }) as {
      status: number;
      body: SharedPlan;
    };
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      exerciseId: 'ex-1',
      sets: 3,
      reps: 10,
      hold: 5,
      rest: 30,
      order: 0,
    });
    expect(res.body.items[0].exercise).toMatchObject({
      id: 'ex-1',
      name: 'Exercise One',
      description: 'Do the thing',
      category: 'knee',
      accentColor: '#123456',
      demoMediaRef: 'media/ex-1.mp4',
      tracking: { angleJoint: { from: 1, vertex: 2, to: 3 }, repUpAngle: 160, repDownAngle: 60 },
    });
  });

  it('filters out and logs items whose exercise is missing', () => {
    const logger = { warn: vi.fn() };
    const withMissing: Plan = {
      ...plan,
      items: [
        ...plan.items,
        { exerciseId: 'gone', sets: 1, reps: 1, hold: 0, rest: 0, order: 2 },
      ],
    };
    const shared = expandPlanForShare(withMissing, { exercises, logger });
    expect(shared.items).toHaveLength(2);
    expect(shared.items.map((i) => i.exerciseId)).not.toContain('gone');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('gone'));
  });

  it('returns 404 with an error envelope for an unknown id', () => {
    const res = handleGetPlanShare('nope', { plans: [plan], exercises }) as {
      status: number;
      body: ErrorEnvelope;
    };
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(PLAN_NOT_FOUND_CODE);
    expect(res.body.error.message).toContain('nope');
  });

  it('every seeded plan expands with fully resolvable exercises (no items dropped)', () => {
    const logger = { warn: vi.fn() };
    for (const seeded of SEED_PLANS) {
      const shared = expandPlanForShare(seeded, { logger });
      expect(shared.items).toHaveLength(seeded.items.length);
    }
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
