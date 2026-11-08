import {
  FREQUENCIES,
  firstOnOrAfter,
  nextOccurrence,
  occurrencesUntil,
  startOfUtcDay,
} from './recurrence';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('nextOccurrence', () => {
  it.each([
    // monthly, anchored to the 31st: short months clamp, then it recovers
    ['2026-01-31', 'monthly', 31, '2026-02-28'],
    ['2026-02-28', 'monthly', 31, '2026-03-31'],
    ['2026-03-31', 'monthly', 31, '2026-04-30'],
    ['2026-12-15', 'monthly', 15, '2027-01-15'],
    ['2026-03-01', 'weekly', 1, '2026-03-08'],
    ['2026-12-28', 'weekly', 28, '2027-01-04'],
    ['2026-11-30', 'quarterly', 30, '2027-02-28'],
    ['2026-08-31', 'semiannual', 31, '2027-02-28'],
    ['2026-03-15', 'yearly', 15, '2027-03-15'],
    // yearly on 29 February: 28th in non-leap years, back to the 29th in leap years
    ['2024-02-29', 'yearly', 29, '2025-02-28'],
    ['2027-02-28', 'yearly', 29, '2028-02-29'],
  ] as const)(
    '%s + %s (anchor %i) -> %s',
    (from, frequency, anchor, expected) => {
      expect(iso(nextOccurrence(d(from), frequency, anchor))).toBe(expected);
    },
  );

  it('returns UTC midnight dates', () => {
    expect(nextOccurrence(d('2026-03-05'), 'monthly', 5).getTime()).toBe(
      d('2026-04-05').getTime(),
    );
  });
});

describe('firstOnOrAfter', () => {
  it('advances until the date is on or after `from`', () => {
    const result = firstOnOrAfter(
      d('2026-03-10'),
      d('2026-01-31'),
      'monthly',
      31,
    );
    expect(iso(result)).toBe('2026-03-31');
  });

  it('returns `current` unchanged when it is already on or after `from`', () => {
    expect(
      iso(firstOnOrAfter(d('2026-03-10'), d('2026-03-10'), 'monthly', 10)),
    ).toBe('2026-03-10');
    expect(
      iso(firstOnOrAfter(d('2026-03-10'), d('2026-05-01'), 'monthly', 1)),
    ).toBe('2026-05-01');
  });
});

describe('occurrencesUntil', () => {
  it('lists the first date and every following one up to `until`, inclusive', () => {
    const dates = occurrencesUntil(
      d('2026-03-05'),
      d('2026-06-10'),
      'monthly',
      5,
    );
    expect(dates.map(iso)).toEqual([
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
      '2026-06-05',
    ]);
  });

  it('includes a date equal to `until`', () => {
    expect(
      occurrencesUntil(d('2026-03-05'), d('2026-04-05'), 'monthly', 5).map(iso),
    ).toEqual(['2026-03-05', '2026-04-05']);
  });

  it('is empty when `first` is after `until`', () => {
    expect(
      occurrencesUntil(d('2026-07-01'), d('2026-06-10'), 'monthly', 1),
    ).toEqual([]);
  });

  it('honours the cap', () => {
    expect(
      occurrencesUntil(d('2026-01-01'), d('2030-01-01'), 'weekly', 1, 5),
    ).toHaveLength(5);
  });
});

describe('startOfUtcDay', () => {
  it('drops the time of day', () => {
    expect(
      startOfUtcDay(new Date('2026-03-05T15:30:45.123Z')).toISOString(),
    ).toBe('2026-03-05T00:00:00.000Z');
  });
});

describe('FREQUENCIES', () => {
  it('lists the supported frequencies', () => {
    expect([...FREQUENCIES]).toEqual([
      'weekly',
      'monthly',
      'quarterly',
      'semiannual',
      'yearly',
    ]);
  });
});
