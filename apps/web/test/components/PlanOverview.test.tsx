import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanOverview } from '../../src/components/PlanOverview';
import type { SharedPlan } from '../../src/types/sharedPlan';

const plan: SharedPlan = {
  id: 'plan-1',
  patientName: 'Ada Lovelace',
  items: [
    {
      exerciseId: 'quad-set',
      sets: 3,
      reps: 10,
      hold: 5,
      rest: 30,
      order: 0,
      exercise: { id: 'quad-set', name: 'Quad set', description: 'Tighten the thigh.' },
    },
    {
      exerciseId: 'heel-slide',
      sets: 2,
      reps: 12,
      hold: 0,
      rest: 20,
      order: 1,
      exercise: { id: 'heel-slide', name: 'Heel slide' },
    },
  ],
};

describe('PlanOverview', () => {
  it('shows the patient name, each exercise with its target, notes, and duration', () => {
    render(<PlanOverview plan={plan} onStart={() => {}} />);

    expect(screen.getByTestId('plan-overview-patient')).toHaveTextContent('Ada Lovelace');

    const items = screen.getAllByTestId('plan-overview-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Quad set');
    expect(items[0]).toHaveTextContent('3 × 5s hold');
    expect(items[0]).toHaveTextContent('Tighten the thigh.');
    expect(items[1]).toHaveTextContent('Heel slide');
    expect(items[1]).toHaveTextContent('2 × 12 reps');

    expect(screen.getByTestId('plan-overview-duration')).toBeInTheDocument();
  });

  it('renders a Start button that calls onStart', async () => {
    const onStart = vi.fn();
    render(<PlanOverview plan={plan} onStart={onStart} />);
    await userEvent.click(screen.getByTestId('plan-overview-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('is read-only: no editable controls beyond Start', () => {
    render(<PlanOverview plan={plan} onStart={() => {}} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows a "no exercises assigned" message and no Start button for an empty plan', () => {
    render(<PlanOverview plan={{ ...plan, items: [] }} onStart={() => {}} />);
    expect(screen.getByText(/no exercises assigned/i)).toBeInTheDocument();
    expect(screen.queryByTestId('plan-overview-start')).toBeNull();
  });
});
