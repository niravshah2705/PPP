import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionDetail } from '../../src/components/SessionDetail';
import type { Session } from '../../src/types/session';

const session: Session = {
  id: 's1',
  planId: 'p1',
  date: '2024-02-10T09:00:00Z',
  completionPct: 75,
  avgForm: 82,
  exercises: [
    { exerciseId: 'met', name: 'Squat', targetReps: 10, completedReps: 10, avgForm: 91, maxRom: 118, skipped: false },
    { exerciseId: 'under', name: 'Lunge', targetReps: 12, completedReps: 6, avgForm: 70, maxRom: 95, skipped: false },
    { exerciseId: 'skip', name: 'Bridge', targetReps: 8, completedReps: 0, avgForm: null, maxRom: null, skipped: true },
  ],
};

describe('SessionDetail', () => {
  it('shows the persisted completion % and avg form in the header', () => {
    render(<SessionDetail session={session} />);
    expect(screen.getByTestId('detail-completion')).toHaveTextContent('75%');
    expect(screen.getByTestId('detail-avg-form')).toHaveTextContent('82');
  });

  it('shows completed vs target with a "met target" flag for completed exercises', () => {
    render(<SessionDetail session={session} />);
    const row = screen.getByTestId('exercise-row-met');
    expect(row).toHaveAttribute('data-state', 'complete');
    const reps = within(row).getByTestId('exercise-reps-met');
    expect(reps).toHaveTextContent('10 / 10');
    expect(reps).toHaveTextContent('Met target');
  });

  it('flags an under-target exercise as partial with completed vs target', () => {
    render(<SessionDetail session={session} />);
    const row = screen.getByTestId('exercise-row-under');
    expect(row).toHaveAttribute('data-state', 'partial');
    const reps = within(row).getByTestId('exercise-reps-under');
    expect(reps).toHaveTextContent('6 / 12');
    expect(reps).toHaveTextContent('Under target');
  });

  it('renders form and ROM per exercise, em dash when missing', () => {
    render(<SessionDetail session={session} />);
    const row = within(screen.getByTestId('exercise-row-met'));
    expect(row.getByText('91')).toBeInTheDocument();
    expect(row.getByText('118°')).toBeInTheDocument();
  });

  it('clearly marks skipped exercises without breaking the row', () => {
    render(<SessionDetail session={session} />);
    const row = screen.getByTestId('exercise-row-skip');
    expect(row).toHaveAttribute('data-state', 'skipped');
    expect(within(row).getByText('Skipped')).toBeInTheDocument();
  });
});
