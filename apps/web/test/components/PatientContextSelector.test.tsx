import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientContextSelector } from '../../src/components/PatientContextSelector';
import { PatientProvider, usePatientContext } from '../../src/context/PatientContext';
import type { Plan } from '../../src/types/plan';

const PLANS: Plan[] = [
  { id: 'ada', patientName: 'Ada Lovelace', items: [], updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'alan', patientName: 'Alan Turing', items: [], updatedAt: '2024-01-02T00:00:00Z' },
  { id: 'bob', patientName: 'Bob Stone', items: [], updatedAt: '2024-01-03T00:00:00Z' },
];

function stubPlans(plans: Plan[] = PLANS) {
  const fn = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(plans), { status: 200 })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function DirtyToggle() {
  const { setDraftDirty } = usePatientContext();
  return (
    <button type="button" data-testid="set-dirty" onClick={() => setDraftDirty(true)}>
      mark dirty
    </button>
  );
}

function renderSelector(initialEntries = ['/doctor/templates']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PatientProvider>
        <PatientContextSelector />
        <DirtyToggle />
        <LocationDisplay />
      </PatientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PatientContextSelector', () => {
  it('restores the patient from the URL query on mount (refresh persistence)', async () => {
    stubPlans();
    renderSelector(['/doctor/templates?patient=Ada%20Lovelace']);

    expect(screen.getByTestId('patient-selector-input')).toHaveValue('Ada Lovelace');
  });

  it('persists a typed patient into the URL query (?patient=)', async () => {
    stubPlans();
    const user = userEvent.setup();
    renderSelector();

    await user.type(screen.getByTestId('patient-selector-input'), 'Grace Hopper');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('patient=Grace+Hopper'),
    );
  });

  it('surfaces previously-used patient names as suggestions and applies the chosen one', async () => {
    stubPlans();
    const user = userEvent.setup();
    renderSelector();

    const input = screen.getByTestId('patient-selector-input');
    await user.click(input);
    await user.type(input, 'a');

    // Suggestions are sourced from GET /api/plans and filtered to the query
    // ("a" is in Ada Lovelace and Alan Turing, not Bob Stone).
    const list = await screen.findByTestId('patient-selector-suggestions');
    expect(list).toHaveTextContent('Ada Lovelace');
    expect(list).toHaveTextContent('Alan Turing');
    expect(list).not.toHaveTextContent('Bob Stone');

    await user.click(screen.getByText('Alan Turing'));

    expect(input).toHaveValue('Alan Turing');
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('patient=Alan+Turing'),
    );
  });

  it('prompts before changing the patient mid-draft; cancelling keeps the current one', async () => {
    stubPlans();
    const user = userEvent.setup();
    renderSelector(['/doctor/templates?patient=Ada%20Lovelace']);

    // A draft is in progress → guarded.
    await user.click(screen.getByTestId('set-dirty'));

    const input = screen.getByTestId('patient-selector-input');
    await user.clear(input);
    await user.type(input, 'Bob Stone{Enter}');

    // The change is not applied silently — the doctor is asked to confirm.
    expect(await screen.findByTestId('patient-change-prompt')).toBeInTheDocument();
    // Context is untouched while the prompt is open (URL still the original).
    expect(screen.getByTestId('location')).toHaveTextContent('patient=Ada');

    await user.click(screen.getByTestId('patient-change-cancel'));

    expect(screen.queryByTestId('patient-change-prompt')).not.toBeInTheDocument();
    expect(input).toHaveValue('Ada Lovelace');
    expect(screen.getByTestId('location')).toHaveTextContent('patient=Ada');
  });

  it('applies the new patient once the mid-draft change is confirmed', async () => {
    stubPlans();
    const user = userEvent.setup();
    renderSelector(['/doctor/templates?patient=Ada%20Lovelace']);

    await user.click(screen.getByTestId('set-dirty'));

    const input = screen.getByTestId('patient-selector-input');
    await user.clear(input);
    await user.type(input, 'Bob Stone{Enter}');

    await screen.findByTestId('patient-change-prompt');
    await user.click(screen.getByTestId('patient-change-confirm'));

    expect(screen.queryByTestId('patient-change-prompt')).not.toBeInTheDocument();
    expect(input).toHaveValue('Bob Stone');
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('patient=Bob+Stone'),
    );
  });
});
