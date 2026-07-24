import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExerciseLoadError,
  ExerciseNotFoundError,
  fetchExercise,
} from '../../src/api/exercises';

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(impl(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchExercise', () => {
  it('calls GET /api/exercises/:id and returns the exercise', async () => {
    const fn = mockFetch(
      () => new Response(JSON.stringify({ id: 'knee-1', name: 'Knee Raise' }), { status: 200 }),
    );
    const exercise = await fetchExercise('knee-1');
    expect(fn).toHaveBeenCalledWith('/api/exercises/knee-1', expect.anything());
    expect(exercise).toEqual({ id: 'knee-1', name: 'Knee Raise' });
  });

  it('encodes the id in the request path', async () => {
    const fn = mockFetch(
      () => new Response(JSON.stringify({ id: 'a/b', name: 'x' }), { status: 200 }),
    );
    await fetchExercise('a/b');
    expect(fn).toHaveBeenCalledWith('/api/exercises/a%2Fb', expect.anything());
  });

  it('throws ExerciseNotFoundError on 404', async () => {
    mockFetch(() => new Response('not found', { status: 404 }));
    await expect(fetchExercise('missing')).rejects.toBeInstanceOf(ExerciseNotFoundError);
  });

  it('throws ExerciseLoadError on 500', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(fetchExercise('x')).rejects.toBeInstanceOf(ExerciseLoadError);
  });

  it('throws ExerciseLoadError on malformed payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(fetchExercise('x')).rejects.toBeInstanceOf(ExerciseLoadError);
  });

  it('wraps network errors as ExerciseLoadError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(fetchExercise('x')).rejects.toBeInstanceOf(ExerciseLoadError);
  });
});
