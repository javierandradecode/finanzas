/**
 * Pure date helpers for credit card billing. "Day" dates are UTC midnight.
 * `month` is 0-based, like Date.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `day` limited to the length of the month (31 in February -> 28 or 29). */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/** The date of `day` in the given month, clamped; month overflow is normalised. */
function dayInMonth(year: number, month: number, day: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  return new Date(Date.UTC(y, m, clampDay(y, m, day)));
}

/**
 * Statement period containing `date`: it ends on the first cutoff on or after
 * the day of `date` (the cutoff day belongs to its own period) and starts the
 * day after the previous cutoff.
 */
export function statementPeriodFor(
  date: Date,
  cutoffDay: number,
): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const thisMonthCutoff = dayInMonth(year, month, cutoffDay);
  const dayOfDate = Date.UTC(year, month, date.getUTCDate());
  const end =
    dayOfDate <= thisMonthCutoff.getTime()
      ? thisMonthCutoff
      : dayInMonth(year, month + 1, cutoffDay);
  const previousCutoff = dayInMonth(
    end.getUTCFullYear(),
    end.getUTCMonth() - 1,
    cutoffDay,
  );
  return { start: new Date(previousCutoff.getTime() + DAY_MS), end };
}

/** First occurrence of `paymentDay` strictly after `periodEnd`. */
export function paymentDateFor(periodEnd: Date, paymentDay: number): Date {
  const year = periodEnd.getUTCFullYear();
  const month = periodEnd.getUTCMonth();
  const candidate = dayInMonth(year, month, paymentDay);
  return candidate.getTime() > periodEnd.getTime()
    ? candidate
    : dayInMonth(year, month + 1, paymentDay);
}

/** `firstDue` plus the following `count - 1` months, each on `paymentDay` (clamped). */
export function monthlyDueDates(
  firstDue: Date,
  paymentDay: number,
  count: number,
): Date[] {
  const year = firstDue.getUTCFullYear();
  const month = firstDue.getUTCMonth();
  return Array.from({ length: count }, (_, k) =>
    k === 0 ? new Date(firstDue) : dayInMonth(year, month + k, paymentDay),
  );
}
