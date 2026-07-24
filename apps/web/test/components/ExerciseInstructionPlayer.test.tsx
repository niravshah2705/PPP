import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseInstructionPlayer } from '../../src/components/ExerciseInstructionPlayer';
import type { SequencerItem } from '../../src/lib/exerciseSequencer';

const items: SequencerItem[] = [
  {
    exerciseId: 'knee-1',
    name: 'Knee Raise',
    description: 'Lift the knee slowly and hold.',
    demoMediaRef: 'https://cdn.example/knee.mp4',
    sets: 2,
    targetReps: 3,
    holdSeconds: 0,
    restSeconds: 5,
  },
  {
    exerciseId: 'calf-1',
    name: 'Calf Stretch',
    sets: 1,
    targetReps: 1,
    holdSeconds: 20,
    restSeconds: 0,
  },
];

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('ExerciseInstructionPlayer', () => {
  it('begins idle, then shows the first exercise instruction with name/description/demo/target', async () => {
    render(<ExerciseInstructionPlayer items={items} />);

    expect(screen.getByTestId('idle-panel')).toHaveTextContent('2 exercises');
    await userEvent.click(screen.getByTestId('begin-session-button'));

    expect(screen.getByTestId('exercise-player')).toHaveAttribute('data-phase', 'instruction');
    expect(screen.getByTestId('exercise-progress')).toHaveTextContent('Exercise 1 of 2');
    expect(screen.getByTestId('exercise-name')).toHaveTextContent('Knee Raise');
    expect(screen.getByTestId('exercise-description')).toHaveTextContent('Lift the knee slowly');
    expect(screen.getByTestId('demo-media')).toHaveAttribute('src', 'https://cdn.example/knee.mp4');
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Set 1 of 2');
    expect(screen.getByTestId('exercise-target')).toHaveTextContent('Target 3 reps');
  });

  it('advances set-by-set with a skippable rest, then exercise-by-exercise to completion', async () => {
    render(<ExerciseInstructionPlayer items={items} />);
    await userEvent.click(screen.getByTestId('begin-session-button'));

    // Instruction → active (Start set).
    await userEvent.click(screen.getByTestId('next-button'));
    expect(screen.getByTestId('exercise-player')).toHaveAttribute('data-phase', 'active');

    // Complete set 1 of 2 → rest.
    await userEvent.click(screen.getByTestId('next-button'));
    expect(screen.getByTestId('rest-panel')).toBeInTheDocument();
    expect(screen.getByTestId('rest-remaining')).toHaveTextContent('5');

    // Skip the rest → back to active for set 2.
    await userEvent.click(screen.getByTestId('skip-rest-button'));
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Set 2 of 2');
    expect(screen.getByTestId('exercise-player')).toHaveAttribute('data-phase', 'active');

    // Complete the last set of exercise 1 → instruction for exercise 2.
    await userEvent.click(screen.getByTestId('next-button'));
    expect(screen.getByTestId('exercise-progress')).toHaveTextContent('Exercise 2 of 2');
    expect(screen.getByTestId('exercise-name')).toHaveTextContent('Calf Stretch');
    // Hold-type exercise shows a hold target instead of reps.
    expect(screen.getByTestId('exercise-target')).toHaveTextContent('Hold 20s');

    // Start + complete the single set → completion screen.
    await userEvent.click(screen.getByTestId('next-button')); // start set
    await userEvent.click(screen.getByTestId('next-button')); // complete set
    expect(screen.getByTestId('session-complete')).toBeInTheDocument();
    const summary = screen.getByTestId('completion-summary');
    expect(summary).toHaveTextContent('Completed');
  });

  it('counts the rest timer down automatically and resumes at zero', async () => {
    vi.useFakeTimers();
    try {
      render(<ExerciseInstructionPlayer items={items} restTickMs={1000} />);
      // We cannot use userEvent with fake timers easily; click via fireEvent-like act.
      act(() => screen.getByTestId('begin-session-button').click());
      act(() => screen.getByTestId('next-button').click()); // start set
      act(() => screen.getByTestId('next-button').click()); // complete set 1 → rest (5s)
      expect(screen.getByTestId('rest-remaining')).toHaveTextContent('5');

      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByTestId('rest-remaining')).toHaveTextContent('2');

      act(() => vi.advanceTimersByTime(2000));
      // Rest elapsed → back to the active set 2.
      expect(screen.getByTestId('exercise-player')).toHaveAttribute('data-phase', 'active');
      expect(screen.getByTestId('set-indicator')).toHaveTextContent('Set 2 of 2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Skip records the exercise as skipped and jumps to the next', async () => {
    render(<ExerciseInstructionPlayer items={items} />);
    await userEvent.click(screen.getByTestId('begin-session-button'));

    await userEvent.click(screen.getByTestId('skip-button'));
    expect(screen.getByTestId('exercise-name')).toHaveTextContent('Calf Stretch');

    // Skip the last exercise too → completion, first row marked Skipped.
    await userEvent.click(screen.getByTestId('skip-button'));
    const summary = screen.getByTestId('completion-summary');
    expect(summary).toHaveTextContent('Skipped');
  });

  it('Previous returns to the prior exercise’s instructions', async () => {
    render(<ExerciseInstructionPlayer items={items} />);
    await userEvent.click(screen.getByTestId('begin-session-button'));

    // Previous is disabled on the first instruction screen.
    expect(screen.getByTestId('previous-button')).toBeDisabled();

    // Skip to exercise 2, then Previous back to exercise 1.
    await userEvent.click(screen.getByTestId('skip-button'));
    expect(screen.getByTestId('exercise-name')).toHaveTextContent('Calf Stretch');
    expect(screen.getByTestId('previous-button')).toBeEnabled();

    await userEvent.click(screen.getByTestId('previous-button'));
    expect(screen.getByTestId('exercise-name')).toHaveTextContent('Knee Raise');
    expect(screen.getByTestId('exercise-progress')).toHaveTextContent('Exercise 1 of 2');
  });

  it('notifies onStateChange and fires onComplete once', async () => {
    const onStateChange = vi.fn();
    const onComplete = vi.fn();
    render(
      <ExerciseInstructionPlayer
        items={[items[1]]}
        onStateChange={onStateChange}
        onComplete={onComplete}
      />,
    );
    // Initial idle state is reported.
    expect(onStateChange).toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('begin-session-button'));
    await userEvent.click(screen.getByTestId('next-button')); // start set
    await userEvent.click(screen.getByTestId('next-button')); // complete → complete phase

    expect(screen.getByTestId('session-complete')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].phase).toBe('complete');
  });
});
