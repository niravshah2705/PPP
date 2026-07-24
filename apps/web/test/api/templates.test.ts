import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExerciseReferencedError,
  TemplateLoadError,
  TemplateNotFoundError,
  TemplateValidationError,
  createTemplate,
  deleteExercise,
  listTemplates,
  updateTemplate,
} from '../../src/api/templates';
import type { TemplateDraft } from '../../src/types/template';

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function validDraft(overrides: Partial<TemplateDraft> = {}): TemplateDraft {
  return {
    name: 'Knee rehab',
    categoryTags: ['knee'],
    items: [{ exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 }],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listTemplates', () => {
  it('GETs /api/templates and returns the gallery list', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify([{ id: 't1', name: 'A', categoryTags: [], items: [] }]),
          { status: 200 },
        ),
    );
    const list = await listTemplates();
    expect(fn).toHaveBeenCalledWith('/api/templates', expect.anything());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('t1');
  });

  it('throws TemplateLoadError on a non-array payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(listTemplates()).rejects.toBeInstanceOf(TemplateLoadError);
  });

  it('throws TemplateLoadError on a server error', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(listTemplates()).rejects.toBeInstanceOf(TemplateLoadError);
  });
});

describe('createTemplate', () => {
  it('POSTs the draft and returns the created template', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({ id: 'new-1', name: 'Knee rehab', categoryTags: ['knee'], items: [] }),
          { status: 201 },
        ),
    );
    const created = await createTemplate(validDraft());
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/templates');
    expect(init?.method).toBe('POST');
    expect(created.id).toBe('new-1');
  });

  it('rejects locally without sending when the draft is invalid', async () => {
    const fn = mockFetch(() => new Response('{}', { status: 201 }));
    await expect(createTemplate(validDraft({ name: '' }))).rejects.toBeInstanceOf(
      TemplateValidationError,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('surfaces field errors from a 422 with the field map', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ errors: [{ field: 'items[0].reps', message: 'reps must be between 1 and 50' }] }),
          { status: 422 },
        ),
    );
    try {
      await createTemplate(validDraft());
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateValidationError);
      expect((err as TemplateValidationError).fieldErrors['items[0].reps']).toContain('between 1 and 50');
    }
  });
});

describe('updateTemplate', () => {
  it('PUTs to /api/templates/:id with the id merged into the body', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({ id: 't1', name: 'Knee rehab', categoryTags: [], items: [] }),
          { status: 200 },
        ),
    );
    await updateTemplate('t1', validDraft());
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/templates/t1');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string).id).toBe('t1');
  });

  it('throws TemplateNotFoundError on 404', async () => {
    mockFetch(() => new Response('nope', { status: 404 }));
    await expect(updateTemplate('missing', validDraft())).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
  });
});

describe('deleteExercise referential integrity', () => {
  it('DELETEs the exercise on success', async () => {
    const fn = mockFetch(() => new Response(null, { status: 204 }));
    await expect(deleteExercise('knee-1')).resolves.toBeUndefined();
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/exercises/knee-1');
    expect(init?.method).toBe('DELETE');
  });

  it('throws ExerciseReferencedError with blocking templates on 409', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ templates: [{ id: 't1', name: 'Knee rehab' }] }),
          { status: 409 },
        ),
    );
    try {
      await deleteExercise('knee-1');
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(ExerciseReferencedError);
      expect((err as ExerciseReferencedError).templates).toEqual([{ id: 't1', name: 'Knee rehab' }]);
    }
  });
});
