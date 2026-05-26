import { describe, expect, it } from 'vitest';
import { parseOcrPayload } from '../pipeline/parser';

describe('ocr parser', () => {
  it('normalizes the cardholder name down to two words', () => {
    const parsed = parseOcrPayload({
      panCandidate: '4111 1111 1111 1111',
      expiryCandidate: '12/29',
      nameCandidate: 'JOHN QUINCY DOE',
    });

    expect(parsed.cardholderName).toBe('JOHN QUINCY');
  });

  it('keeps only 3 digit cvv values', () => {
    const parsed = parseOcrPayload({
      cvvCandidate: 'CVV 123',
    });

    expect(parsed.cvv).toBe('123');
  });

  it('rejects invalid cvv values', () => {
    const parsed = parseOcrPayload({
      cvvCandidate: '1234',
    });

    expect(parsed.cvv).toBeUndefined();
  });

  it('rejects PAN values shorter than 15 digits', () => {
    const parsed = parseOcrPayload({
      panCandidate: '4111 1111 1111 11',
    });

    expect(parsed.pan).toBeUndefined();
  });

  it('accepts 15-digit Amex PAN', () => {
    const parsed = parseOcrPayload({
      panCandidate: '3782 822463 10005',
    });

    expect(parsed.pan).toBe('378282246310005');
    expect(parsed.brand).toBe('amex');
  });

  it('does not accept cvv values sliced from longer numbers', () => {
    const parsed = parseOcrPayload({
      cvvCandidate: '4111111111111111',
    });

    expect(parsed.cvv).toBeUndefined();
  });
});
