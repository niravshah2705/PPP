import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { disposeSpy, createDemoScene } = vi.hoisted(() => {
  const disposeSpy = vi.fn();
  return {
    disposeSpy,
    createDemoScene: vi.fn(() => ({ dispose: disposeSpy, running: true })),
  };
});

vi.mock('../../src/scene/demoScene', () => ({
  createDemoScene,
}));

import { ExerciseScene } from '../../src/components/ExerciseScene';

const exercise = { id: 'knee-1', name: 'Knee Raise', description: 'Lift and hold' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ExerciseScene', () => {
  it('renders a canvas and initialises the demo scene', () => {
    render(<ExerciseScene exercise={exercise} />);
    expect(screen.getByTestId('exercise-scene-canvas')).toBeInTheDocument();
    expect(createDemoScene).toHaveBeenCalledTimes(1);
  });

  it('shows player/tracking chrome when not demoOnly', () => {
    render(<ExerciseScene exercise={exercise} />);
    expect(screen.getByTestId('player-chrome')).toBeInTheDocument();
    expect(screen.getByTestId('tracking-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('player-controls')).toBeInTheDocument();
  });

  it('hides all player/tracking chrome when demoOnly', () => {
    render(<ExerciseScene exercise={exercise} demoOnly />);
    expect(screen.queryByTestId('player-chrome')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tracking-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('exercise-scene')).toHaveAttribute('data-demo-only', 'true');
  });

  it('releases WebGL resources (dispose) on unmount', () => {
    const { unmount } = render(<ExerciseScene exercise={exercise} demoOnly />);
    expect(disposeSpy).not.toHaveBeenCalled();
    unmount();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
