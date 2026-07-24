import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientProgressLoadError, fetchPatientProgress } from '../../src/api/patients';

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(impl(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPatientProgress', () => {
  it('calls GET /api/patients/:name/progress and returns the report', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            patientName: 'Ada',
            exercises: [{ exerciseId: 'ex1', name: 'Squat', points: [] }],
            adherencePct: 75,
          }),
          { status: 200 },
        ),
    );
    const report = await fetchPatientProgress('Ada');
    expect(fn).toHaveBeenCalledWith('/api/patients/Ada/progress', expect.anything());
    expect(report.exercises).toHaveLength(1);
    expect(report.adherencePct).toBe(75);
  });

  it('encodes the patient name in the path', async () => {
    const fn = mockFetch(
      () => new Response(JSON.stringify({ patientName: 'a/b c', exercises: [] }), { status: 200 }),
    );
    await fetchPatientProgress('a/b c');
    expect(fn).toHaveBeenCalledWith('/api/patients/a%2Fb%20c/progress', expect.anything());
  });

  it('returns empty arrays with a 200 no-data response (empty state is a caller concern)', async () => {
    mockFetch(() => new Response(JSON.stringify({ patientName: 'Nobody' }), { status: 200 }));
    await expect(fetchPatientProgress('Nobody')).resolves.toEqual({
      patientName: 'Nobody',
      exercises: [],
      adherencePct: null,
    });
  });

  it('throws PatientProgressLoadError on a malformed payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(fetchPatientProgress('Ada')).rejects.toBeInstanceOf(PatientProgressLoadError);
  });

  it('throws PatientProgressLoadError on non-2xx', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    await expect(fetchPatientProgress('Ada')).rejects.toBeInstanceOf(PatientProgressLoadError);
  });

  it('wraps network errors as PatientProgressLoadError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(fetchPatientProgress('Ada')).rejects.toBeInstanceOf(PatientProgressLoadError);
  });
});
