import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanDraftEditor } from '../../src/components/PlanDraftEditor';
import type { Exercise } from '../../src/types/exercise';
import type { Plan } from '../../src/types/plan';
import type { PlanDraft } from '../../src/types/template';

const library: Exercise[] = [
  { id: 'knee-1', name: 'Knee Raise', category: 'knee' },
  { id: 'knee-3', name: 'Wall Squat', category: 'knee' },
];

const draft: PlanDraft = {
  templateId: 't1',
  name: 'Knee rehab',
  items: [{ exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 }],
};

function stubLibrary(list: Exercise[] = library) {
  const fn = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(list), { status: 200 })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Route the exercise library and the save endpoint through one fetch stub. */
function stubApi(
  save: (method: string, url: string, body: PlanDraft | undefined) => Response | Promise<Response>,
  list: Exercise[] = library,
) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.split('?')[0];
    if (method === 'GET' && path === '/api/exercises') {
      return Promise.resolve(new Response(JSON.stringify(list), { status: 200 }));
    }
    if (path === '/api/plans' || path.startsWith('/api/plans/')) {
      const body = init?.body ? (JSON.parse(String(init.body)) as PlanDraft) : undefined;
      return Promise.resolve(save(method, path, body));
    }
    return Promise.resolve(new Response('unhandled', { status: 500 }));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

const savedPlan: Plan = {
  id: 'plan-9',
  patientName: 'Ada Lovelace',
  templateId: 't1',
  templateName: 'Knee rehab',
  items: [{ exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 }],
  createdAt: '2024-06-01T12:00:00.000Z',
  updatedAt: '2024-06-01T12:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PlanDraftEditor', () => {
  it('renders the seeded items and a summary count', async () => {
    stubLibrary();
    render(<PlanDraftEditor draft={draft} />);
    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('1 exercise in plan');
    expect(screen.getByTestId('plan-item-0')).toBeInTheDocument();
    // Let the picker's async library load settle to avoid act() warnings.
    await screen.findByTestId('exercise-option-knee-3');
  });

  it('appends a library exercise with default dosage and updates the summary', async () => {
    stubLibrary();
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={draft} />);

    await user.click(await screen.findByTestId('exercise-option-knee-3'));

    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('2 exercises in plan');
    expect(screen.getByTestId('item-1-exerciseId')).toHaveValue('knee-3');
    // Default dosage seeded and immediately editable.
    expect(screen.getByTestId('item-1-reps')).toHaveValue(10);
  });

  it('makes the appended item immediately editable (sets/reps/hold/rest)', async () => {
    stubLibrary();
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={draft} />);

    await user.click(await screen.findByTestId('exercise-option-knee-3'));
    const reps = screen.getByTestId('item-1-reps');
    await user.clear(reps);
    await user.type(reps, '20');
    expect(reps).toHaveValue(20);
  });

  it('permits duplicates and visibly flags them', async () => {
    stubLibrary();
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={draft} />);

    // knee-1 is already in the plan → picker shows the badge.
    expect(await screen.findByTestId('exercise-already-knee-1')).toBeInTheDocument();

    await user.click(screen.getByTestId('exercise-option-knee-1'));

    expect(screen.getByTestId('plan-draft-summary')).toHaveTextContent('2 exercises in plan');
    expect(screen.getByTestId('plan-item-0-duplicate')).toBeInTheDocument();
    expect(screen.getByTestId('plan-item-1-duplicate')).toBeInTheDocument();
  });

  it('includes appended items in validation (out-of-bounds dosage surfaces an error)', async () => {
    stubLibrary();
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={draft} />);

    await user.click(await screen.findByTestId('exercise-option-knee-3'));
    const reps = screen.getByTestId('item-1-reps');
    await user.clear(reps);
    await user.type(reps, '99');

    expect(await screen.findByTestId('item-1-reps-error')).toHaveTextContent('between 1 and 50');
  });
});

describe('PlanDraftEditor — save confirmation & hand-off', () => {
  it('shows the returned plan id and a copyable /patient link plus an open-as-patient shortcut', async () => {
    stubApi((method) => (method === 'POST' ? json(savedPlan, 201) : json({}, 500)));
    const user = userEvent.setup();
    // Override after setup() so our spy wins over userEvent's own clipboard stub.
    const writeText = stubClipboard();
    render(<PlanDraftEditor draft={draft} />);

    await user.type(screen.getByTestId('plan-draft-patient'), 'Ada Lovelace');
    await user.click(screen.getByTestId('plan-draft-save'));

    await screen.findByTestId('plan-draft-saved');

    // The returned plan id is surfaced.
    expect(screen.getByTestId('plan-draft-plan-id')).toHaveTextContent('plan-9');

    // The shareable link points at the canonical patient route.
    const expectedUrl = `${window.location.origin}/patient?planId=plan-9`;
    const link = screen.getByTestId('plan-draft-share-link');
    expect(link).toHaveAttribute('href', expectedUrl);
    expect(link).toHaveTextContent(expectedUrl);

    // The "open as patient" shortcut resolves the same route the patient view uses.
    const open = screen.getByTestId('plan-draft-open-as-patient');
    expect(open).toHaveAttribute('href', '/patient?planId=plan-9');

    // The link is copyable.
    await user.click(screen.getByTestId('plan-draft-copy-link'));
    expect(writeText).toHaveBeenCalledWith(expectedUrl);
    await waitFor(() =>
      expect(screen.getByTestId('plan-draft-copy-link')).toHaveTextContent(/copied/i),
    );
  });

  it('surfaces backend field errors on the correct field without losing the draft', async () => {
    stubApi((method) =>
      method === 'POST'
        ? json({ errors: [{ field: 'items[0].reps', message: 'Server rejects reps' }] }, 422)
        : json({}, 500),
    );
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={draft} />);

    await user.type(screen.getByTestId('plan-draft-patient'), 'Ada Lovelace');
    await user.click(screen.getByTestId('plan-draft-save'));

    // The server error lands on the reps field...
    expect(await screen.findByTestId('item-0-reps-error')).toHaveTextContent('Server rejects reps');
    // ...and the draft (patient + items) is intact, with no confirmation shown.
    expect(screen.getByTestId('plan-draft-patient')).toHaveValue('Ada Lovelace');
    expect(screen.getByTestId('item-0-reps')).toHaveValue(10);
    expect(screen.queryByTestId('plan-draft-saved')).not.toBeInTheDocument();
  });

  it('keeps the draft and offers a retry after a network error, then succeeds on retry', async () => {
    let attempt = 0;
    stubApi((method) => {
      if (method !== 'POST') return json({}, 500);
      attempt += 1;
      if (attempt === 1) throw new Error('offline');
      return json(savedPlan, 201);
    });
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={draft} />);

    await user.type(screen.getByTestId('plan-draft-patient'), 'Ada Lovelace');
    await user.click(screen.getByTestId('plan-draft-save'));

    // Failure surfaces with a retry affordance; the draft is untouched.
    await screen.findByTestId('plan-draft-save-error');
    expect(screen.getByTestId('plan-draft-patient')).toHaveValue('Ada Lovelace');
    expect(screen.queryByTestId('plan-draft-saved')).not.toBeInTheDocument();

    // Retrying re-sends the same draft and now persists it.
    await user.click(screen.getByTestId('plan-draft-retry'));
    await screen.findByTestId('plan-draft-saved');
    expect(screen.getByTestId('plan-draft-plan-id')).toHaveTextContent('plan-9');
    expect(screen.queryByTestId('plan-draft-save-error')).not.toBeInTheDocument();
    expect(attempt).toBe(2);
  });

  it('surfaces a save conflict with a retry affordance and keeps the draft', async () => {
    const editDraft: PlanDraft = { ...draft, id: 'plan-9', patientName: 'Ada Lovelace' };
    stubApi((method) => (method === 'PUT' ? json('conflict', 409) : json({}, 500)));
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={editDraft} />);

    await user.click(screen.getByTestId('plan-draft-save'));

    const error = await screen.findByTestId('plan-draft-save-error');
    expect(error).toHaveTextContent(/changed elsewhere/i);
    expect(screen.getByTestId('plan-draft-retry')).toBeInTheDocument();
    expect(screen.getByTestId('plan-draft-patient')).toHaveValue('Ada Lovelace');
  });

  it('updates a previously loaded plan in place (PUT, not a duplicate POST)', async () => {
    const editDraft: PlanDraft = { ...draft, id: 'plan-9', patientName: 'Ada Lovelace' };
    const updated: Plan = { ...savedPlan, updatedAt: '2024-06-02T12:00:00.000Z' };
    const fn = stubApi((method, path) =>
      method === 'PUT' && path === '/api/plans/plan-9' ? json(updated, 200) : json({}, 500),
    );
    const user = userEvent.setup();
    render(<PlanDraftEditor draft={editDraft} />);

    await user.click(screen.getByTestId('plan-draft-save'));
    await screen.findByTestId('plan-draft-saved');

    // The edit went out as a PUT to the same id — never a POST that would duplicate.
    expect(fn).toHaveBeenCalledWith('/api/plans/plan-9', expect.objectContaining({ method: 'PUT' }));
    expect(fn).not.toHaveBeenCalledWith('/api/plans', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByTestId('plan-draft-plan-id')).toHaveTextContent('plan-9');
  });
});
