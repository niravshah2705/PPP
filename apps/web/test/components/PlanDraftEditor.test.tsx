import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanDraftEditor } from '../../src/components/PlanDraftEditor';
import type { Exercise } from '../../src/types/exercise';
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
