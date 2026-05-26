import type { OcrPayload, ParsedCardFields } from '../types';
import { parseExpiry } from '../utils/expiry';
import { inferCardBrand, sanitizePan } from '../utils/pan';

export function parseOcrPayload(payload: OcrPayload): ParsedCardFields {
  const pan = sanitizePan(payload.panCandidate);
  const expiry = parseExpiry(payload.expiryCandidate);
  const cvv = sanitizeCvv(payload.cvvCandidate);

  return {
    pan: pan || undefined,
    expiryMonth: expiry.month,
    expiryYear: expiry.year,
    cardholderName: normalizeCardholderName(payload.nameCandidate),
    cvv,
    brand: inferCardBrand(pan),
  };
}

function sanitizeCvv(raw: string | undefined): string | undefined {
  const digits = raw?.replace(/\D/g, '') ?? '';
  return /^\d{3}$/.test(digits) ? digits : undefined;
}

function normalizeCardholderName(raw: string | undefined): string | undefined {
  const words = raw
    ?.trim()
    .toUpperCase()
    .match(/[A-Z]{2,}/g)
    ?.slice(0, 2);

  if (!words || words.length < 2) {
    return undefined;
  }

  return `${words[0]} ${words[1]}`;
}
