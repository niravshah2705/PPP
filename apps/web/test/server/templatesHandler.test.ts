import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../src/types/exercise';
import type { PlanTemplate } from '../../src/types/planTemplate';
import type { ErrorEnvelope } from '../../src/types/errorEnvelope';
import type { TemplateDetail } from '../../src/types/template';
import {
  TEMPLATE_NOT_FOUND_CODE,
  expandTemplateDetail,
  handleGetTemplate,
  handleListTemplates,
  listTemplateSummaries,
} from '../../src/server/templatesHandler';
import { PLAN_TEMPLATES } from '../../src/server/fixtures/planTemplates';

const exercises: Exercise[] = [
  { id: 'ex-1', name: 'Exercise One', demoMediaRef: 'media/ex-1.mp4' },
  { id: 'ex-2', name: 'Exercise Two', thumbnailUrl: '/thumbs/ex-2.png' },
];

const template: PlanTemplate = {
  id: 't1',
  name: 'Sample',
  description: 'A sample template',
  categoryTags: ['knee'],
  items: [
    { exerciseId: 'ex-1', sets: 3, reps: 10, holdSeconds: 5, restSeconds: 30 },
    { exerciseId: 'ex-2', sets: 2, reps: 12, holdSeconds: 0, restSeconds: 45 },
  ],
};

describe('handleListTemplates (GET /api/templates)', () => {
  it('returns 200 with at least 4 seeded templates, each with an item count', () => {
    const res = handleListTemplates();
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    for (const summary of res.body) {
      expect(summary.itemCount).toBe(summary.items.length);
      expect(summary.itemCount).toBeGreaterThan(0);
    }
  });

  it('maps stored holdSeconds/restSeconds onto wire hold/rest', () => {
    const [summary] = listTemplateSummaries({ templates: [template] });
    expect(summary.items[0]).toMatchObject({ hold: 5, rest: 30, sets: 3, reps: 10 });
  });
});

describe('handleGetTemplate (GET /api/templates/:id)', () => {
  it('returns 200 with expanded items including each exercise name and demoMediaRef', () => {
    const res = handleGetTemplate(PLAN_TEMPLATES[0].id) as { status: number; body: TemplateDetail };
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.exercise.name).toBeTruthy();
      expect(item.exercise.demoMediaRef).toBeTruthy();
    }
  });

  it('joins the resolved exercise onto each item', () => {
    const res = handleGetTemplate('t1', { templates: [template], exercises }) as {
      status: number;
      body: TemplateDetail;
    };
    expect(res.status).toBe(200);
    expect(res.body.itemCount).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].exercise).toEqual({
      id: 'ex-1',
      name: 'Exercise One',
      thumbnailUrl: undefined,
      demoMediaRef: 'media/ex-1.mp4',
    });
  });

  it('filters out and logs items whose exercise is missing, preserving declared itemCount', () => {
    const logger = { warn: vi.fn() };
    const withMissing: PlanTemplate = {
      ...template,
      items: [
        ...template.items,
        { exerciseId: 'gone', sets: 1, reps: 1, holdSeconds: 0, restSeconds: 0 },
      ],
    };
    const detail = expandTemplateDetail(withMissing, { exercises, logger });
    expect(detail.itemCount).toBe(3);
    expect(detail.items).toHaveLength(2);
    expect(detail.items.map((i) => i.exerciseId)).not.toContain('gone');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('gone'));
  });

  it('returns 404 with an error envelope for an unknown id', () => {
    const res = handleGetTemplate('nope', { templates: [template], exercises }) as {
      status: number;
      body: ErrorEnvelope;
    };
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(TEMPLATE_NOT_FOUND_CODE);
    expect(res.body.error.message).toContain('nope');
  });
});
