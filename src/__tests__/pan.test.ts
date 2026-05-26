import { describe, expect, it } from 'vitest';
import { inferCardBrand, luhnCheck, sanitizePan } from '../utils/pan';

describe('pan utilities', () => {
  it('sanitizes PAN input', () => {
    expect(sanitizePan('4111 1111-1111 1111')).toBe('4111111111111111');
  });

  it('rejects PAN values shorter than 15 digits', () => {
    expect(sanitizePan('4111 1111 1111 11')).toBe('');
  });

  it('accepts 15-digit Amex PANs', () => {
    expect(sanitizePan('3782 822463 10005')).toBe('378282246310005');
  });

  it('passes luhn for known valid PAN', () => {
    expect(luhnCheck('4111111111111111')).toBe(true);
  });

  it('fails luhn for invalid PAN', () => {
    expect(luhnCheck('4111111111111112')).toBe(false);
  });

  it('infers card brand', () => {
    expect(inferCardBrand('4111111111111111')).toBe('visa');
    expect(inferCardBrand('378282246310005')).toBe('amex');
  });
});
