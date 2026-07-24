import { describe, expect, it } from 'vitest';
import { buildTrendGeometry } from '../../src/lib/trendChart';
import type { ProgressPoint } from '../../src/types/session';

const OPTS = { width: 100, height: 100, padding: 0 };

describe('buildTrendGeometry', () => {
  it('returns empty geometry for an empty series', () => {
    const geo = buildTrendGeometry([], 'reps', OPTS);
    expect(geo.points).toEqual([]);
    expect(geo.polyline).toBe('');
  });

  it('scales values across the plot height (max at top, min at bottom)', () => {
    const series: ProgressPoint[] = [
      { date: '2024-01-01', reps: 0 },
      { date: '2024-01-02', reps: 10 },
    ];
    const geo = buildTrendGeometry(series, 'reps', OPTS);
    expect(geo.min).toBe(0);
    expect(geo.max).toBe(10);
    // First point (min) sits at the bottom (y=height); last (max) at the top.
    expect(geo.points[0]).toEqual({ x: 0, y: 100 });
    expect(geo.points[1]).toEqual({ x: 100, y: 0 });
  });

  it('places a flat series on the vertical midline (no divide-by-zero)', () => {
    const series: ProgressPoint[] = [
      { date: '2024-01-01', form: 50 },
      { date: '2024-01-02', form: 50 },
    ];
    const geo = buildTrendGeometry(series, 'form', OPTS);
    expect(geo.points.every((p) => p.y === 50)).toBe(true);
  });

  it('skips points whose metric is missing but keeps their x-position (gaps)', () => {
    const series: ProgressPoint[] = [
      { date: '2024-01-01', rom: 100 },
      { date: '2024-01-02' }, // missing rom
      { date: '2024-01-03', rom: 140 },
    ];
    const geo = buildTrendGeometry(series, 'rom', OPTS);
    expect(geo.points).toHaveLength(2);
    // x is by original index / (length-1): indices 0 and 2 of 3 -> 0 and 100.
    expect(geo.points[0].x).toBe(0);
    expect(geo.points[1].x).toBe(100);
  });

  it('ignores non-finite values', () => {
    const series: ProgressPoint[] = [
      { date: '2024-01-01', reps: Number.NaN },
      { date: '2024-01-02', reps: 5 },
    ];
    const geo = buildTrendGeometry(series, 'reps', OPTS);
    expect(geo.points).toHaveLength(1);
  });

  it('builds a polyline string from the scaled points', () => {
    const series: ProgressPoint[] = [
      { date: '2024-01-01', reps: 0 },
      { date: '2024-01-02', reps: 10 },
    ];
    const geo = buildTrendGeometry(series, 'reps', OPTS);
    expect(geo.polyline).toBe('0,100 100,0');
  });
});
