import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SessionLoadError,
  SessionSaveError,
  createSession,
  finalizeSession,
  fetchProgress,
  fetchSessions,
  patchSessionResults,
} from '../../src/api/sessions';

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

describe('patchSessionResults', () => {
  const result = {
    exerciseId: 'knee-1',
    completedReps: 8,
    avgFormScore: 87.5,
    maxRangeOfMotionDeg: 62,
  };

  it('PATCHes /api/sessions/:id with the tracked result body', async () => {
    const fn = mockFetch(() => new Response(null, { status: 204 }));
    await patchSessionResults('s1', result);
    expect(fn).toHaveBeenCalledWith(
      '/api/sessions/s1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(result),
      }),
    );
  });

  it('encodes the session id', async () => {
    const fn = mockFetch(() => new Response(null, { status: 200 }));
    await patchSessionResults('a/b c', result);
    expect(fn).toHaveBeenCalledWith('/api/sessions/a%2Fb%20c', expect.anything());
  });

  it('sends a JSON content-type header', async () => {
    const fn = mockFetch(() => new Response(null, { status: 204 }));
    await patchSessionResults('s1', result);
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws SessionSaveError on non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(patchSessionResults('s1', result)).rejects.toBeInstanceOf(SessionSaveError);
  });

  it('wraps network errors as SessionSaveError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(patchSessionResults('s1', result)).rejects.toBeInstanceOf(SessionSaveError);
  });
});

describe('createSession', () => {
  it('POSTs /api/sessions with the plan/patient + in_progress status', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({ id: 'sess-1', planId: 'p1', status: 'in_progress' }),
          { status: 201 },
        ),
    );
    const session = await createSession({ planId: 'p1', patientName: 'Jamie' });
    expect(fn).toHaveBeenCalledWith(
      '/api/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      planId: 'p1',
      patientName: 'Jamie',
      status: 'in_progress',
    });
    expect(session).toMatchObject({ id: 'sess-1', status: 'in_progress' });
  });

  it('throws SessionSaveError on non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(createSession({ planId: 'p1' })).rejects.toBeInstanceOf(SessionSaveError);
  });

  it('throws SessionSaveError on a malformed payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 201 }));
    await expect(createSession({ planId: 'p1' })).rejects.toBeInstanceOf(SessionSaveError);
  });

  it('wraps network errors as SessionSaveError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(createSession({ planId: 'p1' })).rejects.toBeInstanceOf(SessionSaveError);
  });
});

describe('finalizeSession', () => {
  it('PATCHes /api/sessions/:id with status=completed + completedAt', async () => {
    const fn = mockFetch(() => new Response(null, { status: 204 }));
    await finalizeSession('sess-1', '2024-05-01T10:00:00.000Z');
    expect(fn).toHaveBeenCalledWith(
      '/api/sessions/sess-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      status: 'completed',
      completedAt: '2024-05-01T10:00:00.000Z',
    });
  });

  it('encodes the session id', async () => {
    const fn = mockFetch(() => new Response(null, { status: 204 }));
    await finalizeSession('a/b c', '2024-05-01T10:00:00.000Z');
    expect(fn).toHaveBeenCalledWith('/api/sessions/a%2Fb%20c', expect.anything());
  });

  it('throws SessionSaveError on non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(finalizeSession('sess-1')).rejects.toBeInstanceOf(SessionSaveError);
  });

  it('wraps network errors as SessionSaveError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(finalizeSession('sess-1')).rejects.toBeInstanceOf(SessionSaveError);
  });
});
