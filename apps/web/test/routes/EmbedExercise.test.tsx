import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/scene/demoScene', () => ({
  createDemoScene: vi.fn(() => ({ dispose: vi.fn(), running: true })),
}));

import { EmbedExercise } from '../../src/routes/EmbedExercise';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/embed/exercise/:id" element={<EmbedExercise />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('EmbedExercise route', () => {
  it('renders the looping demo scene with no player/tracking chrome for a valid id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'knee-1', name: 'Knee Raise' }), { status: 200 }),
        ),
      ),
    );

    renderAt('/embed/exercise/knee-1');

    const scene = await screen.findByTestId('exercise-scene');
    expect(scene).toHaveAttribute('data-demo-only', 'true');
    expect(screen.getByTestId('exercise-scene-canvas')).toBeInTheDocument();
    // No player or tracking UI in the embed.
    expect(screen.queryByTestId('player-chrome')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tracking-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-controls')).not.toBeInTheDocument();
  });

  it('shows a compact inline error card (not a blank page) for an invalid id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not found', { status: 404 }))),
    );

    renderAt('/embed/exercise/does-not-exist');

    const card = await screen.findByTestId('inline-error-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent(/does-not-exist/);
    expect(screen.queryByTestId('exercise-scene')).not.toBeInTheDocument();
  });

  it('shows an inline error card on a server/transport error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('boom', { status: 500 }))),
    );

    renderAt('/embed/exercise/knee-1');

    expect(await screen.findByTestId('inline-error-card')).toBeInTheDocument();
  });
});
