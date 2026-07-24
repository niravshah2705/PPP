import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionLoadError, fetchProgress, fetchSessions } from '../../src/api/sessions';

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(impl(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSessions', () => {
  it('calls GET /api/sessions?planId= and returns the list', async () => {
    const fn = mockFetch(
      () => new Response(JSON.stringify([{ id: 's1', planId: 'p1' }]), { status: 200 }),
    );
    const sessions = await fetchSessions('p1');
    expect(fn).toHaveBeenCalledWith('/api/sessions?planId=p1', expect.anything());
    expect(sessions).toHaveLength(1);
  });

  it('encodes the planId in the query string', async () => {
    const fn = mockFetch(() => new Response(JSON.stringify([]), { status: 200 }));
    await fetchSessions('a/b c');
    expect(fn).toHaveBeenCalledWith('/api/sessions?planId=a%2Fb%20c', expect.anything());
  });

  it('returns an empty array as-is (empty state is a caller concern)', async () => {
    mockFetch(() => new Response(JSON.stringify([]), { status: 200 }));
    await expect(fetchSessions('p1')).resolves.toEqual([]);
  });

  it('throws SessionLoadError on non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(fetchSessions('p1')).rejects.toBeInstanceOf(SessionLoadError);
  });

  it('throws SessionLoadError on a non-array payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(fetchSessions('p1')).rejects.toBeInstanceOf(SessionLoadError);
  });

  it('wraps network errors as SessionLoadError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(fetchSessions('p1')).rejects.toBeInstanceOf(SessionLoadError);
  });
});

describe('fetchProgress', () => {
  it('calls GET /api/progress?planId= and returns the series', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({ planId: 'p1', series: [{ date: '2024-01-01', reps: 10 }] }),
          { status: 200 },
        ),
    );
    const progress = await fetchProgress('p1');
    expect(fn).toHaveBeenCalledWith('/api/progress?planId=p1', expect.anything());
    expect(progress.series).toHaveLength(1);
  });

  it('normalises a missing series to an empty array', async () => {
    mockFetch(() => new Response(JSON.stringify({ planId: 'p1' }), { status: 200 }));
    await expect(fetchProgress('p1')).resolves.toEqual({ planId: 'p1', series: [] });
  });

  it('throws SessionLoadError on malformed payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(fetchProgress('p1')).rejects.toBeInstanceOf(SessionLoadError);
  });

  it('throws SessionLoadError on non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 503 }));
    await expect(fetchProgress('p1')).rejects.toBeInstanceOf(SessionLoadError);
  });
});
