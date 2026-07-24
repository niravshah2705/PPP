import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplatesPage } from '../../src/routes/TemplatesPage';
import type { Template } from '../../src/types/template';

const templates: Template[] = [
  {
    id: 't1',
    name: 'Knee rehab',
    description: 'Post-op knee protocol',
    categoryTags: ['knee'],
    items: [
      { exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 },
      { exerciseId: 'knee-2', sets: 2, reps: 15, hold: 0, rest: 45 },
    ],
  },
  {
    id: 't2',
    name: 'Shoulder mobility',
    description: 'Rotator cuff basics',
    categoryTags: ['shoulder'],
    items: [{ exerciseId: 'sh-1', sets: 2, reps: 12, hold: 0, rest: 20 }],
  },
];

/** Route fetch by URL: template gallery + the exercises the builder's picker loads. */
function stubApi() {
  const fn = vi.fn((url: string) => {
    if (url.startsWith('/api/templates')) {
      return Promise.resolve(new Response(JSON.stringify(templates), { status: 200 }));
    }
    if (url.startsWith('/api/exercises')) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderReady() {
  stubApi();
  render(<TemplatesPage />);
  await screen.findByTestId('template-card-t1');
}

describe('TemplatesPage — instantiate plan from template', () => {
  it('instantiates an editable draft mirroring the template items and defaults', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByTestId('template-use-t1'));

    expect(await screen.findByTestId('plan-draft-editor')).toBeInTheDocument();
    // Knee rehab has two items; the summary mirrors them.
    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('2 exercises in plan');
    expect(screen.getByTestId('instantiated-draft')).toHaveTextContent('Knee rehab');
  });

  it('binds the draft to the current patient and pre-fills it in the builder', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.type(screen.getByTestId('templates-current-patient'), 'Ada Lovelace');
    await user.click(screen.getByTestId('template-use-t1'));

    const patient = (await screen.findByTestId('plan-draft-patient')) as HTMLInputElement;
    expect(patient.value).toBe('Ada Lovelace');
  });

  it('does not prompt when instantiating the first template (no unsaved draft yet)', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByTestId('template-use-t1'));

    await screen.findByTestId('plan-draft-editor');
    expect(screen.queryByTestId('draft-replace-prompt')).not.toBeInTheDocument();
  });

  it('prompts before discarding an existing unsaved draft when a second template is used', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByTestId('template-use-t1'));
    await screen.findByTestId('plan-draft-editor');

    await user.click(screen.getByTestId('template-use-t2'));

    // The prompt guards the work: nothing has been discarded yet.
    expect(await screen.findByTestId('draft-replace-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('instantiated-draft')).toHaveTextContent('Knee rehab');
  });

  it('replaces the draft with the new template on confirm', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByTestId('template-use-t1'));
    await screen.findByTestId('plan-draft-editor');
    await user.click(screen.getByTestId('template-use-t2'));
    await screen.findByTestId('draft-replace-prompt');

    await user.click(screen.getByTestId('draft-replace-confirm'));

    expect(screen.queryByTestId('draft-replace-prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('instantiated-draft')).toHaveTextContent('Shoulder mobility');
    // Shoulder mobility has a single item — the earlier draft was replaced.
    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('1 exercise in plan');
  });

  it('merges the new template into the existing draft on merge', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByTestId('template-use-t1'));
    await screen.findByTestId('plan-draft-editor');
    await user.click(screen.getByTestId('template-use-t2'));
    await screen.findByTestId('draft-replace-prompt');

    await user.click(screen.getByTestId('draft-merge-confirm'));

    expect(screen.queryByTestId('draft-replace-prompt')).not.toBeInTheDocument();
    // Knee rehab (2) + Shoulder mobility (1) = 3 items in the merged draft.
    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('3 exercises in plan');
    // Identity stays with the original draft.
    expect(screen.getByTestId('instantiated-draft')).toHaveTextContent('Knee rehab');
  });

  it('keeps the current draft when the prompt is cancelled', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByTestId('template-use-t1'));
    await screen.findByTestId('plan-draft-editor');
    await user.click(screen.getByTestId('template-use-t2'));
    await screen.findByTestId('draft-replace-prompt');

    await user.click(screen.getByTestId('draft-replace-cancel'));

    expect(screen.queryByTestId('draft-replace-prompt')).not.toBeInTheDocument();
    const editor = screen.getByTestId('plan-draft-editor');
    expect(within(editor).getByTestId('plan-draft-summary')).toHaveTextContent('2 exercises in plan');
    expect(screen.getByTestId('instantiated-draft')).toHaveTextContent('Knee rehab');
  });
});
