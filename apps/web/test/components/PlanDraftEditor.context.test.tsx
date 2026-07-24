import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanDraftEditor } from '../../src/components/PlanDraftEditor';
import { PatientProvider } from '../../src/context/PatientContext';
import type { Plan } from '../../src/types/plan';
import type { PlanDraft } from '../../src/types/template';

const draft: PlanDraft = {
  templateId: 't1',
  name: 'Knee rehab',
  items: [{ exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 }],
};

const savedPlan: Plan = {
  id: 'plan-9',
  patientName: 'Ada Lovelace',
  templateId: 't1',
  items: draft.items,
  updatedAt: '2024-06-01T12:00:00.000Z',
};

/** Route the exercise library + save endpoint through one fetch stub. */
function stubApi(save?: (body: PlanDraft | undefined) => Response) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.split('?')[0];
    if (path === '/api/exercises') {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    if (path === '/api/plans' || path.startsWith('/api/plans/')) {
      const body = init?.body ? (JSON.parse(String(init.body)) as PlanDraft) : undefined;
      return Promise.resolve(
        save ? save(body) : new Response(JSON.stringify(savedPlan), { status: 201 }),
      );
    }
    return Promise.resolve(new Response('unhandled', { status: 500 }));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderEditor(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PatientProvider>
        <PlanDraftEditor draft={draft} />
      </PatientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PlanDraftEditor + patient context', () => {
  it('disables save and shows a header hint when no patient is set', async () => {
    stubApi();
    renderEditor(['/doctor/templates']);

    // Let the picker's async (empty) library load settle to avoid act() warnings.
    await screen.findByTestId('exercise-picker-no-matches');

    // The free-text patient field is gone — the header owns the patient now.
    expect(screen.queryByTestId('plan-draft-patient')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-draft-patient-readout')).toHaveTextContent('No patient selected');
    const hint = screen.getByTestId('plan-draft-patient-hint');
    expect(hint).toHaveTextContent(/set a patient in the header/i);
    expect(screen.getByTestId('plan-draft-save')).toBeDisabled();
  });

  it('reads the patient from context, enabling save and persisting under that patient', async () => {
    const fetchFn = stubApi();
    const user = userEvent.setup();
    renderEditor(['/doctor/templates?patient=Ada%20Lovelace']);

    expect(screen.getByTestId('plan-draft-patient-readout')).toHaveTextContent('Building plan for Ada Lovelace');
    expect(screen.queryByTestId('plan-draft-patient-hint')).not.toBeInTheDocument();

    const save = screen.getByTestId('plan-draft-save');
    expect(save).toBeEnabled();
    await user.click(save);

    await screen.findByTestId('plan-draft-saved');
    const post = fetchFn.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(post).toBeTruthy();
    const body = JSON.parse(String((post![1] as RequestInit).body)) as PlanDraft;
    expect(body.patientName).toBe('Ada Lovelace');
  });

  it('treats a whitespace-only URL patient as unset (save stays disabled)', async () => {
    stubApi();
    renderEditor(['/doctor/templates?patient=%20%20']);

    await screen.findByTestId('exercise-picker-no-matches');
    expect(screen.getByTestId('plan-draft-save')).toBeDisabled();
    expect(screen.getByTestId('plan-draft-patient-hint')).toBeInTheDocument();
  });
});
