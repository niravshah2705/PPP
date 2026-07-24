import { describe, expect, it } from 'vitest';
import {
  distinctPatientNames,
  filterPatientSuggestions,
  normalizePatientName,
} from '../../src/lib/patientSuggestions';
import type { Plan } from '../../src/types/plan';

function plan(patientName: string): Plan {
  return { id: patientName, patientName, items: [], updatedAt: '2024-01-01T00:00:00Z' };
}

describe('normalizePatientName', () => {
  it('trims and returns the name, or null for blank/whitespace-only', () => {
    expect(normalizePatientName('  Ada  ')).toBe('Ada');
    expect(normalizePatientName('')).toBeNull();
    expect(normalizePatientName('   ')).toBeNull();
    expect(normalizePatientName(undefined)).toBeNull();
    expect(normalizePatientName(null)).toBeNull();
  });
});

describe('distinctPatientNames', () => {
  it('collapses case-insensitive duplicates (first casing wins) and sorts alphabetically', () => {
    const names = distinctPatientNames([
      plan('Bob Stone'),
      plan('ada lovelace'),
      plan('Ada Lovelace'),
      plan('bob stone'),
    ]);
    expect(names).toEqual(['ada lovelace', 'Bob Stone']);
  });

  it('trims names and drops blank/whitespace-only patients', () => {
    const names = distinctPatientNames([plan('  Grace  '), plan('   '), plan('')]);
    expect(names).toEqual(['Grace']);
  });

  it('never mutates the input', () => {
    const input = [plan('Ada'), plan('Bob')];
    const copy = structuredClone(input);
    distinctPatientNames(input);
    expect(input).toEqual(copy);
  });
});

describe('filterPatientSuggestions', () => {
  const names = ['Ada Lovelace', 'Alan Turing', 'Bob Stone'];

  it('returns all names for an empty query', () => {
    expect(filterPatientSuggestions(names, '')).toEqual(names);
    expect(filterPatientSuggestions(names, '   ')).toEqual(names);
  });

  it('matches case-insensitively on substring', () => {
    // "a" appears in Ada Lovelace and Alan Turing, but not in Bob Stone.
    expect(filterPatientSuggestions(names, 'a')).toEqual(['Ada Lovelace', 'Alan Turing']);
    expect(filterPatientSuggestions(names, 'STONE')).toEqual(['Bob Stone']);
    expect(filterPatientSuggestions(names, 'ala')).toEqual(['Alan Turing']);
  });

  it('drops an exact (case-insensitive) match so it does not suggest what is already typed', () => {
    expect(filterPatientSuggestions(names, 'ada lovelace')).toEqual([]);
  });

  it('caps the number of results to the limit', () => {
    expect(filterPatientSuggestions(names, '', 2)).toEqual(['Ada Lovelace', 'Alan Turing']);
  });
});
