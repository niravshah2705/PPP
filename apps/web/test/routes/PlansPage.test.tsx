import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlansPage } from '../../src/routes/PlansPage';
import type { Plan } from '../../src/types/plan';

const plans: Plan[] = [
  {
    id: 'ada',
    patientName: 'Ada Lovelace',
    templateId: 't1',
    templateName: 'Knee rehab',
    items: [{ exerciseId: 'a', sets: 3, reps: 10, hold: 0, rest: 30 }],
    updatedAt: '2024-01-01T10:00:00Z',
  },
  {
    id: 'bob',
    patientName: 'Bob Stone',
    templateId: 't2',
    templateName: 'Shoulder mobility',
    items: [
      { exerciseId: 'a', sets: 3, reps: 10, hold: 0, rest: 30 },
      { exerciseId: 'b', sets: 2, reps: 12, hold: 0, rest: 20 },
    ],
    updatedAt: '2024-05-01T10:00:00Z',
  },
];

/** Route fetch by URL: plans list + the exercises the builder's picker loads. */
function stubApi(list: Plan[] | Error) {
  const fn = vi.fn((url: string) => {
    if (url.startsWith('/api/plans')) {
      if (list instanceof Error) return Promise.reject(list);
      return Promise.resolve(new Response(JSON.stringify(list), { status: 200 }));
    }
    if (url.startsWith('/api/exercises')) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function stubClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlansPage', () => {
  it('lists all plans newest-first with patient, template, and item count', async () => {
    stubApi(plans);
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('plan-list')).toBeInTheDocument());

    const rows = screen.getAllByTestId(/^plan-row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'plan-row-bob');
    expect(rows[1]).toHaveAttribute('data-testid', 'plan-row-ada');

    expect(screen.getByTestId('plan-patient-ada')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByTestId('plan-template-ada')).toHaveTextContent('Knee rehab');
    expect(screen.getByTestId('plan-count-bob')).toHaveTextContent('2');
    expect(screen.getByTestId('plan-updated-ada')).toHaveTextContent('2024-01-01');
  });

  it('searches by patient name', async () => {
    stubApi(plans);
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('plan-list')).toBeInTheDocument());

    await userEvent.type(screen.getByTestId('plans-search'), 'ada');
    expect(screen.getByTestId('plan-row-ada')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-row-bob')).not.toBeInTheDocument();
  });

  it('searches by template name', async () => {
    stubApi(plans);
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('plan-list')).toBeInTheDocument());

    await userEvent.type(screen.getByTestId('plans-search'), 'shoulder');
    expect(screen.getByTestId('plan-row-bob')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-row-ada')).not.toBeInTheDocument();
  });

  it('opens a plan in the builder along the edit path (patient retained)', async () => {
    stubApi(plans);
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('plan-list')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('plan-open-ada'));

    expect(screen.getByRole('heading', { name: 'Edit plan' })).toBeInTheDocument();
    const context = screen.getByTestId('plans-builder-context');
    expect(context).toHaveTextContent('Ada Lovelace');
    expect(context).toHaveTextContent('Saving updates this plan');
    // The builder shows the plan's existing item(s).
    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('1 exercise');
  });

  it('duplicates a plan into a new draft with the patient cleared', async () => {
    stubApi(plans);
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('plan-list')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('plan-duplicate-bob'));

    expect(screen.getByRole('heading', { name: 'New plan' })).toBeInTheDocument();
    expect(screen.getByTestId('plans-patient-cleared')).toBeInTheDocument();
    // Items are preserved from the source plan (Bob had 2).
    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('2 exercises');
  });

  it('copies the working patient deep link to the clipboard', async () => {
    const writeText = stubClipboard();
    stubApi(plans);
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('plan-list')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('plan-copy-ada'));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/plan/ada`);
    await waitFor(() =>
      expect(screen.getByTestId('plan-copy-ada')).toHaveTextContent('Copied!'),
    );
  });

  it('shows the empty state when there are no plans', async () => {
    stubApi([]);
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('plans-empty')).toBeInTheDocument());
  });

  it('shows an error card when the plans request fails', async () => {
    stubApi(new Error('offline'));
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('inline-error-card')).toBeInTheDocument());
  });
});
