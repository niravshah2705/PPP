import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplatePreviewPanel } from '../../src/components/TemplatePreviewPanel';

const detail = {
  id: 't1',
  name: 'Knee rehab',
  categoryTags: ['knee'],
  itemCount: 1,
  items: [
    {
      exerciseId: 'knee-1',
      sets: 3,
      reps: 10,
      hold: 5,
      rest: 30,
      exercise: { id: 'knee-1', name: 'Knee Flexion', thumbnailUrl: '/thumbs/knee-1.png' },
    },
  ],
};

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(impl(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TemplatePreviewPanel', () => {
  it('prompts to pick a template when nothing is selected (and does not fetch)', () => {
    const fn = mockFetch(() => new Response('{}', { status: 200 }));
    render(<TemplatePreviewPanel templateId={undefined} />);
    expect(screen.getByTestId('template-preview-idle')).toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
  });

  it('shows a loading state while the detail is in flight', async () => {
    let resolve!: (r: Response) => void;
    mockFetch(() => new Promise<Response>((res) => (resolve = res)));
    render(<TemplatePreviewPanel templateId="t1" />);
    expect(screen.getByTestId('template-preview-loading')).toBeInTheDocument();
    resolve(new Response(JSON.stringify(detail), { status: 200 }));
    await screen.findByTestId('template-preview');
  });

  it('renders the expanded preview once loaded', async () => {
    mockFetch(() => new Response(JSON.stringify(detail), { status: 200 }));
    render(<TemplatePreviewPanel templateId="t1" />);
    expect(await screen.findByTestId('template-preview-item-knee-1')).toHaveTextContent('Knee Flexion');
  });

  it('shows a not-found message on 404', async () => {
    mockFetch(() => new Response('nope', { status: 404 }));
    render(<TemplatePreviewPanel templateId="gone" />);
    expect(await screen.findByTestId('template-preview-not-found')).toBeInTheDocument();
  });

  it('shows an error with a working retry that refetches', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const fn = mockFetch(() => {
      calls += 1;
      return calls === 1
        ? new Response('boom', { status: 500 })
        : new Response(JSON.stringify(detail), { status: 200 });
    });

    render(<TemplatePreviewPanel templateId="t1" />);
    await screen.findByTestId('template-preview-error');

    await user.click(screen.getByTestId('template-preview-retry'));

    expect(await screen.findByTestId('template-preview')).toBeInTheDocument();
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });

  it('refetches when the selected template id changes', async () => {
    const fn = mockFetch(
      (url) =>
        new Response(JSON.stringify({ ...detail, id: url.endsWith('t2') ? 't2' : 't1' }), {
          status: 200,
        }),
    );
    const { rerender } = render(<TemplatePreviewPanel templateId="t1" />);
    await screen.findByTestId('template-preview');
    rerender(<TemplatePreviewPanel templateId="t2" />);
    await waitFor(() => expect(fn).toHaveBeenCalledWith('/api/templates/t2', expect.anything()));
  });
});
