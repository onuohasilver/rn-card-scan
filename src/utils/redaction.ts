export function redactPan(rawPan?: string): string {
  if (!rawPan) {
    return '';
  }

  const digits = rawPan.replace(/\D/g, '');
  if (digits.length <= 4) {
    return digits;
  }

  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
