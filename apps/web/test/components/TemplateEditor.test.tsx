import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplateEditor } from '../../src/components/TemplateEditor';
import type { Template } from '../../src/types/template';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function stubFetch(impl: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('TemplateEditor (create)', () => {
  it('surfaces validation errors on the correct fields and does not POST', async () => {
    const user = userEvent.setup();
    const fetchFn = stubFetch(() => new Response('{}', { status: 201 }));

    render(<TemplateEditor />);
    // Submit empty: name + items errors should appear, nothing persisted.
    await user.click(screen.getByTestId('template-save'));

    expect(screen.getByTestId('template-name-error')).toBeInTheDocument();
    expect(screen.getByTestId('template-items-error')).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('shows a per-item dosage error on the offending field', async () => {
    const user = userEvent.setup();
    stubFetch(() => new Response('{}', { status: 201 }));

    render(<TemplateEditor />);
    await user.type(screen.getByTestId('template-name'), 'Knee rehab');
    await user.type(screen.getByTestId('add-exercise-input'), 'knee-1');
    await user.click(screen.getByTestId('add-exercise-button'));

    // Drive reps out of bounds (max 50).
    const reps = screen.getByTestId('item-0-reps');
    await user.clear(reps);
    await user.type(reps, '99');
    await user.click(screen.getByTestId('template-save'));

    expect(await screen.findByTestId('item-0-reps-error')).toHaveTextContent('between 1 and 50');
  });

  it('POSTs a valid draft and reports the created template', async () => {
    const user = userEvent.setup();
    const created: Template = {
      id: 'new-1',
      name: 'Knee rehab',
      categoryTags: ['knee'],
      items: [{ exerciseId: 'knee-1', sets: 1, reps: 10, hold: 0, rest: 30 }],
    };
    const fetchFn = stubFetch(() => new Response(JSON.stringify(created), { status: 201 }));
    const onSaved = vi.fn();

    render(<TemplateEditor onSaved={onSaved} />);
    await user.type(screen.getByTestId('template-name'), 'Knee rehab');
    await user.type(screen.getByTestId('tag-input'), 'knee');
    await user.click(screen.getByTestId('tag-add-button'));
    await user.type(screen.getByTestId('add-exercise-input'), 'knee-1');
    await user.click(screen.getByTestId('add-exercise-button'));
    await user.click(screen.getByTestId('template-save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created));
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/templates');
    expect(init?.method).toBe('POST');
  });

  it('maps a 422 server field error onto the item control', async () => {
    const user = userEvent.setup();
    stubFetch(
      () =>
        new Response(
          JSON.stringify({ errors: [{ field: 'items[0].rest', message: 'rest must be between 0 and 300' }] }),
          { status: 422 },
        ),
    );

    render(<TemplateEditor />);
    await user.type(screen.getByTestId('template-name'), 'Knee rehab');
    await user.type(screen.getByTestId('add-exercise-input'), 'knee-1');
    await user.click(screen.getByTestId('add-exercise-button'));
    await user.click(screen.getByTestId('template-save'));

    expect(await screen.findByTestId('item-0-rest-error')).toHaveTextContent('between 0 and 300');
  });
});

describe('TemplateEditor (edit)', () => {
  it('PUTs to /api/templates/:id with existing values prefilled', async () => {
    const user = userEvent.setup();
    const template: Template = {
      id: 't1',
      name: 'Knee rehab',
      description: 'Post-op',
      categoryTags: ['knee'],
      items: [{ exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 }],
    };
    const fetchFn = stubFetch(() => new Response(JSON.stringify(template), { status: 200 }));
    const onSaved = vi.fn();

    render(<TemplateEditor template={template} onSaved={onSaved} />);
    expect((screen.getByTestId('template-name') as HTMLInputElement).value).toBe('Knee rehab');

    await user.type(screen.getByTestId('template-name'), ' v2');
    await user.click(screen.getByTestId('template-save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/templates/t1');
    expect(init?.method).toBe('PUT');
  });
});
