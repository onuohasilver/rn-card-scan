import type { ParsedCardFields, ValidationResult } from '../types';
import { isExpiryPlausible } from '../utils/expiry';
import { inferCardBrand, luhnCheck } from '../utils/pan';

export function validateCardFields(
  fields: ParsedCardFields,
  allowedBrands?: ParsedCardFields['brand'][]
): ValidationResult {
  const reasons: string[] = [];
  const pan = fields.pan ?? '';
  const brand = fields.brand ?? inferCardBrand(pan);

  if (!pan) {
    reasons.push('PAN_MISSING');
  } else if (!luhnCheck(pan)) {
    reasons.push('PAN_LUHN_FAILED');
  }

  if (allowedBrands && allowedBrands.length > 0 && !allowedBrands.includes(brand)) {
    reasons.push('BRAND_NOT_ALLOWED');
  }

  if (fields.expiryMonth && fields.expiryYear && !isExpiryPlausible(fields.expiryMonth, fields.expiryYear)) {
    reasons.push('EXPIRY_IMPLAUSIBLE');
  }

  return {
    valid: reasons.length === 0,
    reasons,
    brand,
  };
}
