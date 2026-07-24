import { buildTrendGeometry, type TrendMetric } from '../lib/trendChart';
import type { ProgressPoint } from '../types/session';
import './TrendChart.css';

interface MetricConfig {
  metric: TrendMetric;
  label: string;
  color: string;
}

/** The three trends the progress endpoint reports, drawn as overlaid lines. */
const METRICS: MetricConfig[] = [
  { metric: 'reps', label: 'Reps', color: '#4f46e5' },
  { metric: 'form', label: 'Form', color: '#0ea5e9' },
  { metric: 'rom', label: 'ROM', color: '#16a34a' },
];

const VIEW_W = 320;
const VIEW_H = 120;

export interface TrendChartProps {
  series: ProgressPoint[];
}

/**
 * Trend chart of reps, form, and ROM over time, rendered from the progress
 * endpoint's chart-ready series as a lightweight inline SVG (no chart lib).
 *
 * Empty series render an explicit "no trend data yet" note; partial data (a
 * metric missing on some dates) is handled per-metric so a gap in one line
 * never blanks the whole chart or breaks the layout.
 */
export function TrendChart({ series }: TrendChartProps) {
  const geometries = METRICS.map((cfg) => ({
    ...cfg,
    geometry: buildTrendGeometry(series, cfg.metric, {
      width: VIEW_W,
      height: VIEW_H,
      padding: 8,
    }),
  }));

  const hasAnyData = geometries.some((g) => g.geometry.points.length > 0);

  if (!hasAnyData) {
    return (
      <div className="trend-chart trend-chart--empty" data-testid="trend-chart">
        <p className="trend-chart__empty-note" data-testid="trend-empty">
          No trend data yet — charts appear once the patient logs sessions.
        </p>
      </div>
    );
  }

  return (
    <div className="trend-chart" data-testid="trend-chart">
      <svg
        className="trend-chart__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Reps, form, and ROM over time"
      >
        {geometries.map(({ metric, color, geometry }) => {
          if (geometry.points.length === 0) return null;
          return (
            <g key={metric} data-testid={`trend-series-${metric}`}>
              {geometry.points.length > 1 && (
                <polyline
                  className="trend-chart__line"
                  points={geometry.polyline}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              )}
              {geometry.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="trend-chart__legend" data-testid="trend-legend">
        {geometries.map(({ metric, label, color, geometry }) => (
          <li key={metric} className="trend-chart__legend-item">
            <span className="trend-chart__swatch" style={{ background: color }} aria-hidden="true" />
            {label}
            {geometry.points.length === 0 && (
              <span className="trend-chart__legend-missing"> (no data)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
