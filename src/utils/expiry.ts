export interface ParsedExpiry {
  month?: number;
  year?: number;
}

export function parseExpiry(raw: string | undefined): ParsedExpiry {
  if (!raw) {
    return {};
  }

  const cleaned = raw.replace(/\s/g, '');
  const match = cleaned.match(/^(\d{2})\/(\d{2}|\d{4})$/);

  if (!match) {
    return {};
  }

  const month = Number.parseInt(match[1], 10);
  const yearRaw = Number.parseInt(match[2], 10);
  const year = match[2].length === 2 ? 2000 + yearRaw : yearRaw;

  if (month < 1 || month > 12) {
    return {};
  }

  return { month, year };
}

export function isExpiryPlausible(month?: number, year?: number, now = new Date()): boolean {
  if (!month || !year) {
    return false;
  }

  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();

  if (year < currentYear || year > currentYear + 20) {
    return false;
  }

  if (year === currentYear && month < currentMonth) {
    return false;
  }

  return true;
}
