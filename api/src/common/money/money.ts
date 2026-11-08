const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** Parses a decimal string ("19.99") into integer cents without using floats. */
export function toCents(input: string): number {
  const match = DECIMAL_PATTERN.exec(input);
  if (!match) {
    throw new Error(`Invalid money amount: "${input}"`);
  }
  const [, sign, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return sign ? -cents : cents;
}

/** Formats integer cents for display, e.g. 1999 -> "$19,99" (es-EC, USD). */
export function formatCents(
  cents: number,
  currency = 'USD',
  locale = 'es-EC',
): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Cents must be a safe integer, got ${cents}`);
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    cents / 100,
  );
}
