import { describe, expect, it } from 'vitest';
import { patientPlanPath, patientPlanShareUrl } from '../../src/lib/planLink';

describe('patientPlanPath', () => {
  it('builds the canonical patient plan path with the id as a query param', () => {
    expect(patientPlanPath('plan-1')).toBe('/patient?planId=plan-1');
  });

  it('encodes the plan id', () => {
    expect(patientPlanPath('a/b c')).toBe('/patient?planId=a%2Fb%20c');
  });
});

describe('patientPlanShareUrl', () => {
  it('resolves against the current origin when available', () => {
    // jsdom provides window.location.origin (http://localhost:3000 by default).
    const url = patientPlanShareUrl('plan-1');
    expect(url.endsWith('/patient?planId=plan-1')).toBe(true);
    expect(url).toContain(window.location.origin);
  });
});
