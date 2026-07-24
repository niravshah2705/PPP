import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DoctorExercisePreview } from '../../src/components/DoctorExercisePreview';

describe('DoctorExercisePreview', () => {
  it('embeds the demo route via an iframe', () => {
    render(<DoctorExercisePreview exerciseId="knee-1" exerciseName="Knee Raise" />);
    const iframe = screen.getByTestId('doctor-preview-iframe') as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('src')).toBe('/embed/exercise/knee-1');
    expect(iframe.getAttribute('title')).toContain('Knee Raise');
  });
});
