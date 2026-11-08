import { clampDay } from '../credit-cards/billing-dates';

/**
 * Pure date helpers for recurring charges. Dates are UTC midnight.
 *
 * Monthly-based frequencies keep an `anchorDay` (the day of the first charge)
 * so a charge on the 31st falls on the 28th in February and goes back to the
 * 31st in March, instead of drifting to the 28th forever.
 */

export const FREQUENCIES = [
  'weekly',
  'monthly',
  'quarterly',
  'semiannual',
  'yearly',
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS_PER_PERIOD: Record<Exclude<Frequency, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function nextOccurrence(
  current: Date,
  frequency: Frequency,
  anchorDay: number,
): Date {
  if (frequency === 'weekly') {
    return new Date(current.getTime() + 7 * DAY_MS);
  }
  const first = new Date(
    Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth() + MONTHS_PER_PERIOD[frequency],
      1,
    ),
  );
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  return new Date(Date.UTC(year, month, clampDay(year, month, anchorDay)));
}

/** `current` if it is already on or after `from`; otherwise the first occurrence that is. */
export function firstOnOrAfter(
  from: Date,
  current: Date,
  frequency: Frequency,
  anchorDay: number,
): Date {
  let date = current;
  while (date.getTime() < from.getTime()) {
    date = nextOccurrence(date, frequency, anchorDay);
  }
  return date;
}

/** `first` and every following occurrence up to and including `until`. */
export function occurrencesUntil(
  first: Date,
  until: Date,
  frequency: Frequency,
  anchorDay: number,
  cap = 1000,
): Date[] {
  const dates: Date[] = [];
  let date = first;
  while (date.getTime() <= until.getTime() && dates.length < cap) {
    dates.push(date);
    date = nextOccurrence(date, frequency, anchorDay);
  }
  return dates;
}
