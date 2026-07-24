import { describe, expect, it } from 'vitest';
import { patientPlanPath, patientPlanShareUrl } from '../../src/lib/planLink';

describe('patientPlanPath', () => {
  it('builds the canonical patient plan path', () => {
    expect(patientPlanPath('plan-1')).toBe('/plan/plan-1');
  });

  it('encodes the plan id', () => {
    expect(patientPlanPath('a/b c')).toBe('/plan/a%2Fb%20c');
  });
});

describe('patientPlanShareUrl', () => {
  it('resolves against the current origin when available', () => {
    // jsdom provides window.location.origin (http://localhost:3000 by default).
    const url = patientPlanShareUrl('plan-1');
    expect(url.endsWith('/plan/plan-1')).toBe(true);
    expect(url).toContain(window.location.origin);
  });
});
