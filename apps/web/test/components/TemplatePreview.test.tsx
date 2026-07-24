import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TemplatePreview, formatDosage } from '../../src/components/TemplatePreview';
import type { TemplateDetail } from '../../src/types/template';

function detail(overrides: Partial<TemplateDetail> = {}): TemplateDetail {
  return {
    id: 't1',
    name: 'Knee rehab',
    description: 'Post-op knee protocol',
    categoryTags: ['knee', 'post-op'],
    itemCount: 2,
    items: [
      {
        exerciseId: 'knee-1',
        sets: 3,
        reps: 10,
        hold: 5,
        rest: 30,
        exercise: { id: 'knee-1', name: 'Knee Flexion', thumbnailUrl: '/thumbs/knee-1.png' },
      },
      {
        exerciseId: 'knee-2',
        sets: 2,
        reps: 15,
        hold: 0,
        rest: 45,
        exercise: { id: 'knee-2', name: 'Knee Extension' },
      },
    ],
    ...overrides,
  };
}

describe('formatDosage', () => {
  it('renders sets × reps, adding the hold only when it is positive', () => {
    expect(formatDosage({ sets: 3, reps: 10, hold: 5 })).toBe('3 × 10 · hold 5s');
    expect(formatDosage({ sets: 2, reps: 15, hold: 0 })).toBe('2 × 15');
  });
});

describe('TemplatePreview', () => {
  it('lists each exercise with its name and default dosage', () => {
    render(<TemplatePreview detail={detail()} />);
    const first = screen.getByTestId('template-preview-item-knee-1');
    expect(first).toHaveTextContent('Knee Flexion');
    expect(screen.getByTestId('template-preview-dosage-knee-1')).toHaveTextContent('3 × 10 · hold 5s');
    expect(screen.getByTestId('template-preview-dosage-knee-2')).toHaveTextContent('2 × 15');
  });

  it('renders the thumbnail when the exercise has one', () => {
    render(<TemplatePreview detail={detail()} />);
    const thumb = screen.getByTestId('template-preview-thumb-knee-1') as HTMLImageElement;
    expect(thumb.getAttribute('src')).toBe('/thumbs/knee-1.png');
  });

  it('falls back to the demo media reference when no thumbnail is set', () => {
    const d = detail({
      items: [
        {
          exerciseId: 'knee-1',
          sets: 3,
          reps: 10,
          hold: 0,
          rest: 30,
          exercise: { id: 'knee-1', name: 'Knee Flexion', demoMediaRef: '/media/knee-1.mp4' },
        },
      ],
      itemCount: 1,
    });
    render(<TemplatePreview detail={d} />);
    const thumb = screen.getByTestId('template-preview-thumb-knee-1') as HTMLImageElement;
    expect(thumb.getAttribute('src')).toBe('/media/knee-1.mp4');
  });

  it('shows a subtle note when items were filtered out (missing exercise)', () => {
    // itemCount 2, but one item resolved => one unavailable.
    const d = detail({
      itemCount: 2,
      items: [
        {
          exerciseId: 'knee-1',
          sets: 3,
          reps: 10,
          hold: 5,
          rest: 30,
          exercise: { id: 'knee-1', name: 'Knee Flexion' },
        },
      ],
    });
    render(<TemplatePreview detail={d} />);
    // Remaining item still renders...
    expect(screen.getByTestId('template-preview-item-knee-1')).toBeInTheDocument();
    // ...with a singular "1 item unavailable" note rather than failing.
    expect(screen.getByTestId('template-preview-unavailable')).toHaveTextContent('1 item unavailable');
  });

  it('pluralises the unavailable note for more than one missing item', () => {
    const d = detail({ itemCount: 3, items: [detail().items[0]] });
    render(<TemplatePreview detail={d} />);
    expect(screen.getByTestId('template-preview-unavailable')).toHaveTextContent('2 items unavailable');
  });

  it('omits the note when every item resolved', () => {
    render(<TemplatePreview detail={detail()} />);
    expect(screen.queryByTestId('template-preview-unavailable')).not.toBeInTheDocument();
  });

  it('shows an all-unavailable message when no items resolved', () => {
    render(<TemplatePreview detail={detail({ itemCount: 2, items: [] })} />);
    expect(screen.getByTestId('template-preview-empty')).toBeInTheDocument();
    expect(screen.getByTestId('template-preview-unavailable')).toHaveTextContent('2 items unavailable');
  });

  it('renders the template name and category tags in the header', () => {
    render(<TemplatePreview detail={detail()} />);
    const preview = screen.getByTestId('template-preview');
    expect(within(preview).getByText('Knee rehab')).toBeInTheDocument();
    expect(within(preview).getByText('post-op')).toBeInTheDocument();
  });
});
