import {
  isMonthKey,
  lastMonths,
  monthKeyOf,
  monthRange,
  monthsBetween,
} from './months';

const iso = (d: Date) => d.toISOString();

describe('isMonthKey', () => {
  it.each(['2026-03', '1999-12', '2026-01'])('accepts %p', (value) => {
    expect(isMonthKey(value)).toBe(true);
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-03', '', '2026-03-01', 'abc'])(
    'rejects %p',
    (value) => {
      expect(isMonthKey(value)).toBe(false);
    },
  );
});

describe('monthKeyOf', () => {
  it('uses UTC: the last instant of March is March, the next one is April', () => {
    expect(monthKeyOf(new Date('2026-03-31T23:59:59.999Z'))).toBe('2026-03');
    expect(monthKeyOf(new Date('2026-04-01T00:00:00.000Z'))).toBe('2026-04');
  });
});

describe('monthRange', () => {
  it.each([
    ['2026-02', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'],
    ['2024-02', '2024-02-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'],
    ['2026-12', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
    ['2026-01', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'],
  ])('%s', (month, start, endExclusive) => {
    const range = monthRange(month);
    expect([iso(range.start), iso(range.endExclusive)]).toEqual([
      start,
      endExclusive,
    ]);
  });

  it('throws on a malformed month', () => {
    expect(() => monthRange('2026-13')).toThrow();
  });
});

describe('monthsBetween', () => {
  it('lists the months inclusively, across a year boundary', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('returns the month itself when both ends are equal', () => {
    expect(monthsBetween('2026-03', '2026-03')).toEqual(['2026-03']);
  });

  it('throws when from is after to', () => {
    expect(() => monthsBetween('2026-04', '2026-03')).toThrow();
  });
});

describe('lastMonths', () => {
  it('ends at the month of `now`, ascending', () => {
    expect(lastMonths(3, new Date('2026-01-15T10:00:00Z'))).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });

  it('12 months are unique and ascending', () => {
    const months = lastMonths(12, new Date('2026-06-30T23:59:59Z'));
    expect(months).toHaveLength(12);
    expect(new Set(months).size).toBe(12);
    expect(months[0]).toBe('2025-07');
    expect(months[11]).toBe('2026-06');
    expect([...months].sort()).toEqual(months);
  });
});
