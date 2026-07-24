import type { ProgressPoint } from '../types/session';

/** Which metric of a {@link ProgressPoint} a chart series plots. */
export type TrendMetric = 'reps' | 'form' | 'rom';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartGeometry {
  /** Scaled points, in date order, for values that were present. */
  points: ChartPoint[];
  /** `points` as an SVG polyline `points` attribute string. */
  polyline: string;
  /** Min/max of the raw metric values that were plotted. */
  min: number;
  max: number;
}

export interface BuildTrendOptions {
  width?: number;
  height?: number;
  /** Inner padding so strokes/markers are not clipped at the edges. */
  padding?: number;
}

const DEFAULTS: Required<BuildTrendOptions> = { width: 100, height: 100, padding: 4 };

/**
 * Build SVG-ready geometry for one metric of a progress series.
 *
 * Points whose metric value is missing (null/undefined/NaN) are skipped so
 * partial data never breaks the layout. X is positioned by each point's index
 * in the ORIGINAL series (so gaps read as gaps, not compressed), and Y is
 * scaled against the plotted values' own min/max. A flat series renders on the
 * vertical midline rather than dividing by zero.
 */
export function buildTrendGeometry(
  series: readonly ProgressPoint[],
  metric: TrendMetric,
  options: BuildTrendOptions = {},
): ChartGeometry {
  const { width, height, padding } = { ...DEFAULTS, ...options };

  const plotted: Array<{ index: number; value: number }> = [];
  series.forEach((point, index) => {
    const raw = point[metric];
    if (raw != null && Number.isFinite(raw)) {
      plotted.push({ index, value: raw });
    }
  });

  if (plotted.length === 0) {
    return { points: [], polyline: '', min: 0, max: 0 };
  }

  const values = plotted.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  // Position on the x-axis by index across the full series length.
  const lastIndex = Math.max(series.length - 1, 1);

  const points: ChartPoint[] = plotted.map(({ index, value }) => {
    const x = padding + (innerW * index) / lastIndex;
    // Higher values sit higher on screen (smaller y). Flat series -> midline.
    const norm = span === 0 ? 0.5 : (value - min) / span;
    const y = padding + innerH * (1 - norm);
    return { x: round(x), y: round(y) };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  return { points, polyline, min, max };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
