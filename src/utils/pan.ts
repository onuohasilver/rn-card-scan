import type { CardBrand } from '../types';

export function sanitizePan(raw: string | undefined): string {
  if (!raw) {
    return '';
  }

  const digits = raw.replace(/\D/g, '');
  return /^\d{15,16}$/.test(digits) ? digits : '';
}

export function luhnCheck(pan: string): boolean {
  if (!/^\d{12,19}$/.test(pan)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let digit = Number.parseInt(pan.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export function inferCardBrand(pan: string): CardBrand {
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(pan)) {
    return 'visa';
  }

  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7([01]\d{12}|20\d{12})))$/.test(pan)) {
    return 'mastercard';
  }

  if (/^3[47]\d{13}$/.test(pan)) {
    return 'amex';
  }

  if (/^(6011\d{12}|65\d{14}|64[4-9]\d{13})$/.test(pan)) {
    return 'discover';
  }

  return 'other';
}
