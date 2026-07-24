import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionList } from '../../src/components/SessionList';
import type { Session } from '../../src/types/session';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    planId: 'p1',
    date: '2024-01-01T10:00:00Z',
    completionPct: 80,
    avgForm: 85,
    exercises: [
      { exerciseId: 'a', name: 'A', targetReps: 10, completedReps: 10, avgForm: 90, maxRom: 120, skipped: false },
      { exerciseId: 'b', name: 'B', targetReps: 10, completedReps: 0, avgForm: null, maxRom: null, skipped: true },
    ],
    ...overrides,
  };
}

describe('SessionList', () => {
  it('renders completion %, avg form, and done/skipped counts per row', () => {
    render(<SessionList sessions={[makeSession()]} onSelect={() => {}} />);
    expect(screen.getByTestId('session-completion-s1')).toHaveTextContent('80% complete');
    expect(screen.getByTestId('session-form-s1')).toHaveTextContent('Avg form 85');
    expect(screen.getByText('1 done · 1 skipped')).toBeInTheDocument();
  });

  it('renders rows in the given (newest-first) order', () => {
    const sessions = [
      makeSession({ id: 'new', date: '2024-03-01T00:00:00Z' }),
      makeSession({ id: 'old', date: '2024-01-01T00:00:00Z' }),
    ];
    render(<SessionList sessions={sessions} onSelect={() => {}} />);
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveAttribute('data-testid', 'session-row-new');
    expect(rows[1]).toHaveAttribute('data-testid', 'session-row-old');
  });

  it('marks the selected row and fires onSelect when a row is clicked', async () => {
    const onSelect = vi.fn();
    render(<SessionList sessions={[makeSession()]} selectedId="s1" onSelect={onSelect} />);
    const row = screen.getByTestId('session-row-s1');
    expect(row).toHaveAttribute('aria-current', 'true');
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('s1');
  });
});
