import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrendChart } from '../../src/components/TrendChart';
import type { ProgressPoint } from '../../src/types/session';

describe('TrendChart', () => {
  it('renders a series line for each metric present in the progress data', () => {
    const series: ProgressPoint[] = [
      { date: '2024-01-01', reps: 8, form: 80, rom: 100 },
      { date: '2024-01-02', reps: 10, form: 85, rom: 110 },
    ];
    render(<TrendChart series={series} />);
    expect(screen.getByTestId('trend-series-reps')).toBeInTheDocument();
    expect(screen.getByTestId('trend-series-form')).toBeInTheDocument();
    expect(screen.getByTestId('trend-series-rom')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /reps, form, and rom over time/i })).toBeInTheDocument();
  });

  it('shows an empty note when the series has no data', () => {
    render(<TrendChart series={[]} />);
    expect(screen.getByTestId('trend-empty')).toBeInTheDocument();
  });

  it('handles partial data (a metric missing on all points) without breaking', () => {
    const series: ProgressPoint[] = [
      { date: '2024-01-01', reps: 8 },
      { date: '2024-01-02', reps: 10 },
    ];
    render(<TrendChart series={series} />);
    expect(screen.getByTestId('trend-series-reps')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-series-form')).not.toBeInTheDocument();
    // The chart still renders (not the empty state) because reps has data.
    expect(screen.queryByTestId('trend-empty')).not.toBeInTheDocument();
  });
});
