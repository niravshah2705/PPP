import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** Stub navigator.xr.isSessionSupported to force WebXR supported/unsupported. */
function stubWebXR(supported: boolean | 'absent') {
  if (supported === 'absent') {
    vi.stubGlobal('navigator', { ...globalThis.navigator, xr: undefined });
    return;
  }
  vi.stubGlobal('navigator', {
    ...globalThis.navigator,
    xr: { isSessionSupported: vi.fn(() => Promise.resolve(supported)) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ExerciseScene', () => {
  it('renders a canvas and initialises the demo scene', async () => {
    stubWebXR('absent');
    render(<ExerciseScene exercise={exercise} />);
    expect(screen.getByTestId('exercise-scene-canvas')).toBeInTheDocument();
    expect(createDemoScene).toHaveBeenCalledTimes(1);
    // Flush the async WebXR probe so its state update settles inside act().
    await waitFor(() => expect(screen.queryByTestId('enter-vr-button')).not.toBeInTheDocument());
  });

  it('shows scene chrome (header) when not demoOnly', async () => {
    stubWebXR('absent');
    render(<ExerciseScene exercise={exercise} />);
    expect(screen.getByTestId('scene-chrome')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Knee Raise' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('enter-vr-button')).not.toBeInTheDocument());
  });

  it('hides all chrome when demoOnly (chrome-free embed)', () => {
    stubWebXR(true);
    render(<ExerciseScene exercise={exercise} demoOnly />);
    expect(screen.queryByTestId('scene-chrome')).not.toBeInTheDocument();
    expect(screen.queryByTestId('enter-vr-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('exercise-scene')).toHaveAttribute('data-demo-only', 'true');
    // The inline 3D demo still renders.
    expect(screen.getByTestId('exercise-scene-canvas')).toBeInTheDocument();
  });

  it('shows the Enter-VR button when WebXR is supported', async () => {
    stubWebXR(true);
    render(<ExerciseScene exercise={exercise} />);
    expect(await screen.findByTestId('enter-vr-button')).toBeInTheDocument();
  });

  it('renders the inline 3D demo with NO Enter-VR button when WebXR is unsupported', async () => {
    stubWebXR(false);
    render(<ExerciseScene exercise={exercise} />);
    // Canvas (inline 3D demo) is present immediately…
    expect(screen.getByTestId('exercise-scene-canvas')).toBeInTheDocument();
    // …and the Enter-VR button never appears.
    await waitFor(() => expect(createDemoScene).toHaveBeenCalled());
    expect(screen.queryByTestId('enter-vr-button')).not.toBeInTheDocument();
  });

  it('renders the inline 3D demo with NO Enter-VR button when navigator.xr is absent', async () => {
    stubWebXR('absent');
    render(<ExerciseScene exercise={exercise} />);
    expect(screen.getByTestId('exercise-scene-canvas')).toBeInTheDocument();
    await waitFor(() => expect(createDemoScene).toHaveBeenCalled());
    expect(screen.queryByTestId('enter-vr-button')).not.toBeInTheDocument();
  });

  it('releases WebGL resources (dispose) on unmount', () => {
    stubWebXR('absent');
    const { unmount } = render(<ExerciseScene exercise={exercise} demoOnly />);
    expect(disposeSpy).not.toHaveBeenCalled();
    unmount();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
