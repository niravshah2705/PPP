import { describe, expect, it } from 'vitest';
import { instantiateDraftFromTemplate } from '../../src/lib/instantiateTemplate';
import type { Template } from '../../src/types/template';

const template: Template = {
  id: 'tmpl-1',
  name: 'Knee rehab',
  description: 'Post-op knee protocol',
  categoryTags: ['knee'],
  items: [
    { exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 },
    { exerciseId: 'knee-2', sets: 2, reps: 15, hold: 0, rest: 45 },
  ],
};

describe('instantiateDraftFromTemplate', () => {
  it('creates a plan draft that preserves item defaults and links the template', () => {
    const draft = instantiateDraftFromTemplate(template);
    expect(draft.templateId).toBe('tmpl-1');
    expect(draft.name).toBe('Knee rehab');
    expect(draft.items).toEqual(template.items);
  });

  it('applies a name override', () => {
    const draft = instantiateDraftFromTemplate(template, { name: 'Ada — knee plan' });
    expect(draft.name).toBe('Ada — knee plan');
  });

  it('deep-copies items so plan edits do not mutate the source template', () => {
    const draft = instantiateDraftFromTemplate(template);
    draft.items[0].sets = 99;
    expect(template.items[0].sets).toBe(3);
    expect(draft.items).not.toBe(template.items);
  });
});
