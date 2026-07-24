import { describe, expect, it } from 'vitest';
import { embedExercisePath } from '../../src/lib/embedUrl';

describe('embedExercisePath', () => {
  it('builds the canonical embed route path', () => {
    expect(embedExercisePath('abc')).toBe('/embed/exercise/abc');
  });

  it('encodes ids with special characters', () => {
    expect(embedExercisePath('a b/c')).toBe('/embed/exercise/a%20b%2Fc');
  });
});
