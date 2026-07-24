import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import type { Exercise } from '../../src/types/exercise';

const library: Exercise[] = [
  { id: 'knee-1', name: 'Knee Raise', category: 'knee', thumbnailUrl: 'https://img/knee-1.png' },
  { id: 'knee-2', name: 'Wall Squat', category: 'knee' },
  { id: 'sh-1', name: 'Shoulder Press', category: 'shoulder' },
];

function stubFetch(impl: (url: string) => Response) {
  const fn = vi.fn((url: string) => Promise.resolve(impl(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function stubLibrary(list: Exercise[] = library) {
  return stubFetch(() => new Response(JSON.stringify(list), { status: 200 }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ExercisePicker', () => {
  it('loads the library from GET /api/exercises and renders options with tags + thumbnails', async () => {
    const fn = stubLibrary();
    render(<ExercisePicker onSelect={vi.fn()} />);

    expect(await screen.findByTestId('exercise-option-knee-1')).toBeInTheDocument();
    expect(fn).toHaveBeenCalledWith('/api/exercises', expect.anything());
    expect(screen.getByTestId('exercise-category-knee-1')).toHaveTextContent('knee');
    expect(screen.getByTestId('exercise-thumb-knee-1')).toBeInTheDocument();
  });

  it('filters by name', async () => {
    stubLibrary();
    const user = userEvent.setup();
    render(<ExercisePicker onSelect={vi.fn()} />);
    await screen.findByTestId('exercise-option-knee-1');

    await user.type(screen.getByTestId('exercise-picker-search'), 'squat');

    expect(screen.getByTestId('exercise-option-knee-2')).toBeInTheDocument();
    expect(screen.queryByTestId('exercise-option-knee-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('exercise-option-sh-1')).not.toBeInTheDocument();
  });

  it('filters by category', async () => {
    stubLibrary();
    const user = userEvent.setup();
    render(<ExercisePicker onSelect={vi.fn()} />);
    await screen.findByTestId('exercise-option-knee-1');

    await user.type(screen.getByTestId('exercise-picker-search'), 'shoulder');

    expect(screen.getByTestId('exercise-option-sh-1')).toBeInTheDocument();
    expect(screen.queryByTestId('exercise-option-knee-1')).not.toBeInTheDocument();
  });

  it('shows a no-matches state instead of a blank list', async () => {
    stubLibrary();
    const user = userEvent.setup();
    render(<ExercisePicker onSelect={vi.fn()} />);
    await screen.findByTestId('exercise-option-knee-1');

    await user.type(screen.getByTestId('exercise-picker-search'), 'zzz');

    expect(screen.getByTestId('exercise-picker-no-matches')).toBeInTheDocument();
    expect(screen.queryByTestId('exercise-picker-list')).not.toBeInTheDocument();
  });

  it('flags exercises already in the plan but still allows selecting them', async () => {
    stubLibrary();
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ExercisePicker existingExerciseIds={new Set(['knee-1'])} onSelect={onSelect} />);
    await screen.findByTestId('exercise-option-knee-1');

    expect(screen.getByTestId('exercise-already-knee-1')).toHaveTextContent('already in plan');
    expect(screen.queryByTestId('exercise-already-knee-2')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('exercise-option-knee-1'));
    expect(onSelect).toHaveBeenCalledWith(library[0]);
  });

  it('calls onSelect with the chosen exercise', async () => {
    stubLibrary();
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ExercisePicker onSelect={onSelect} />);
    await screen.findByTestId('exercise-option-sh-1');

    await user.click(screen.getByTestId('exercise-option-sh-1'));
    expect(onSelect).toHaveBeenCalledWith(library[2]);
  });

  it('shows an error state when the library fails to load', async () => {
    stubFetch(() => new Response('boom', { status: 500 }));
    render(<ExercisePicker onSelect={vi.fn()} />);
    expect(await screen.findByTestId('exercise-picker-error')).toBeInTheDocument();
  });
});
