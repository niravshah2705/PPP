import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplateGallery } from '../../src/components/TemplateGallery';
import type { PlanDraft, Template } from '../../src/types/template';

const templates: Template[] = [
  {
    id: 't1',
    name: 'Knee rehab',
    description: 'Post-op knee protocol',
    categoryTags: ['knee', 'post-op'],
    items: [
      { exerciseId: 'knee-1', sets: 3, reps: 10, hold: 5, rest: 30 },
      { exerciseId: 'knee-2', sets: 2, reps: 15, hold: 0, rest: 45 },
    ],
  },
];

describe('TemplateGallery', () => {
  it('renders a card per template with its name, tags and item count', () => {
    render(<TemplateGallery templates={templates} />);
    const card = screen.getByTestId('template-card-t1');
    expect(card).toHaveTextContent('Knee rehab');
    expect(card).toHaveTextContent('knee');
    expect(card).toHaveTextContent('2 exercises');
  });

  it('shows an empty state when there are no templates', () => {
    render(<TemplateGallery templates={[]} />);
    expect(screen.getByTestId('template-gallery-empty')).toBeInTheDocument();
  });

  it('instantiates a plan draft via the template-to-draft flow on "Use template"', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn<(draft: PlanDraft) => void>();
    render(<TemplateGallery templates={templates} onUse={onUse} />);

    await user.click(screen.getByTestId('template-use-t1'));

    expect(onUse).toHaveBeenCalledTimes(1);
    const draft = onUse.mock.calls[0][0];
    expect(draft.templateId).toBe('t1');
    expect(draft.items).toEqual(templates[0].items);
  });

  it('requests editing a template on "Edit"', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<TemplateGallery templates={templates} onEdit={onEdit} />);
    await user.click(screen.getByTestId('template-edit-t1'));
    expect(onEdit).toHaveBeenCalledWith(templates[0]);
  });
});
