import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptySessions } from '../../src/components/EmptySessions';

describe('EmptySessions', () => {
  it('guides the doctor to share the plan link', () => {
    render(<EmptySessions planId="plan-42" />);
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
    expect(screen.getByText(/share the plan link/i)).toBeInTheDocument();
  });

  it('surfaces the shareable plan link pointing at the patient plan path', () => {
    render(<EmptySessions planId="plan-42" />);
    const link = screen.getByTestId('empty-plan-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/patient?planId=plan-42');
  });
});
