import { describe, expect, it } from 'vitest';
import { isExpiryPlausible, parseExpiry } from '../utils/expiry';

describe('expiry utilities', () => {
  it('parses MM/YY and MM/YYYY', () => {
    expect(parseExpiry('09/29')).toEqual({ month: 9, year: 2029 });
    expect(parseExpiry('09/2029')).toEqual({ month: 9, year: 2029 });
  });

  it('rejects invalid month', () => {
    expect(parseExpiry('13/29')).toEqual({});
  });

  it('checks plausibility by current date', () => {
    const now = new Date('2026-02-24T00:00:00.000Z');
    expect(isExpiryPlausible(2, 2026, now)).toBe(true);
    expect(isExpiryPlausible(1, 2026, now)).toBe(false);
  });
});
