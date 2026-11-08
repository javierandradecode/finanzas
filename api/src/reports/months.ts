/**
 * Pure month helpers. A month is a "YYYY-MM" string and everything is UTC, so
 * reports never shift because of the server's time zone.
 */

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (value: string): boolean => MONTH_PATTERN.test(value);

const pad = (n: number) => String(n).padStart(2, '0');

export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** First instant of the month and the first instant of the next one. */
export function monthRange(month: string): { start: Date; endExclusive: Date } {
  if (!isMonthKey(month)) throw new Error(`Invalid month: "${month}"`);
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    endExclusive: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

/** Every month from `from` to `to`, both included, ascending. */
export function monthsBetween(from: string, to: string): string[] {
  if (from > to) throw new Error(`"from" (${from}) is after "to" (${to})`);
  const months: string[] = [];
  let cursor = monthRange(from).start;
  const last = monthRange(to).start.getTime();
  while (cursor.getTime() <= last) {
    months.push(monthKeyOf(cursor));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }
  return months;
}

/** The last `count` months, ending with the month of `now`. */
export function lastMonths(count: number, now: Date): string[] {
  const first = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1), 1),
  );
  return monthsBetween(monthKeyOf(first), monthKeyOf(now));
}
