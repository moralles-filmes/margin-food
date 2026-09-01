import { describe, expect, it } from 'vitest';
import { formatDateValueBR, parseUTCToBR } from './datetime';

describe('formatDateValueBR', () => {
  it('formats a database date without a timezone shift', () => {
    expect(formatDateValueBR('2026-08-28')).toBe('28/08/2026');
  });

  it('formats timestamps in the Brazilian timezone', () => {
    expect(formatDateValueBR('2026-08-29T01:30:00.000Z')).toBe('28/08/2026');
    expect(parseUTCToBR('2026-08-29T01:30:00.000Z')).toBe('28/08/2026 22:30');
  });

  it('uses the fallback for missing or invalid dates', () => {
    expect(formatDateValueBR(null)).toBe('—');
    expect(formatDateValueBR('2026-02-30', '-')).toBe('-');
  });
});
