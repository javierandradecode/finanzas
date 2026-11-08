import {
  clampDay,
  monthlyDueDates,
  paymentDateFor,
  statementPeriodFor,
} from './billing-dates';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('clampDay', () => {
  it.each([
    [2026, 1, 31, 28],
    [2024, 1, 31, 29],
    [2026, 3, 31, 30],
    [2026, 0, 31, 31],
    [2026, 2, 15, 15],
  ])('clampDay(%i, %i, %i) = %i', (year, month, day, expected) => {
    expect(clampDay(year, month, day)).toBe(expected);
  });
});

describe('statementPeriodFor', () => {
  it.each([
    ['2026-03-10', 15, '2026-02-16', '2026-03-15'],
    ['2026-03-15', 15, '2026-02-16', '2026-03-15'], // cutoff day belongs to its own period
    ['2026-03-16', 15, '2026-03-16', '2026-04-15'],
    ['2026-12-20', 15, '2026-12-16', '2027-01-15'], // year rollover
    ['2026-02-10', 31, '2026-02-01', '2026-02-28'],
    ['2026-03-10', 31, '2026-03-01', '2026-03-31'],
    ['2024-02-20', 31, '2024-02-01', '2024-02-29'], // leap year
  ])('%s with cutoff %i -> %s..%s', (date, cutoff, start, end) => {
    const period = statementPeriodFor(d(date), cutoff);
    expect([iso(period.start), iso(period.end)]).toEqual([start, end]);
  });
});

describe('paymentDateFor', () => {
  it.each([
    ['2026-03-15', 5, '2026-04-05'],
    ['2026-03-15', 20, '2026-03-20'],
    ['2026-03-15', 15, '2026-04-15'], // strictly after the cutoff
    ['2026-03-31', 31, '2026-04-30'],
    ['2026-12-31', 5, '2027-01-05'],
  ])('after %s with payment day %i -> %s', (periodEnd, day, expected) => {
    expect(iso(paymentDateFor(d(periodEnd), day))).toBe(expected);
  });
});

describe('monthlyDueDates', () => {
  it('clamps to the end of shorter months and recovers afterwards', () => {
    const dates = monthlyDueDates(d('2026-01-31'), 31, 4).map(iso);
    expect(dates).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('crosses the year boundary', () => {
    const dates = monthlyDueDates(d('2026-11-05'), 5, 3).map(iso);
    expect(dates).toEqual(['2026-11-05', '2026-12-05', '2027-01-05']);
  });

  it('returns Date objects at UTC midnight', () => {
    const [first] = monthlyDueDates(d('2026-03-05'), 5, 1);
    expect(first.getTime()).toBe(d('2026-03-05').getTime());
  });
});
