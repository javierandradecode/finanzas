import { formatDateUtc, formatDayUtc, formatMonth, formatMonthShort, monthRangeLocal, todayLocal } from './dates'

describe('dates', () => {
  it('todayLocal uses the local calendar, not UTC', () => {
    // 20:00 local on the 15th: in UTC-5 that is already the 16th in UTC.
    expect(todayLocal(new Date(2026, 2, 15, 20, 0))).toBe('2026-03-15')
    expect(todayLocal(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
  })

  it('monthRangeLocal returns the first and last day of the local month', () => {
    expect(monthRangeLocal(new Date(2026, 1, 10))).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(monthRangeLocal(new Date(2028, 1, 10)).to).toBe('2028-02-29')
    expect(monthRangeLocal(new Date(2026, 11, 31))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
  })

  it('formatDateUtc shows the UTC day whatever the local zone is', () => {
    const out = formatDateUtc('2026-03-15T00:00:00.000Z')
    expect(out).toContain('15')
    expect(out).toContain('2026')
    expect(formatDateUtc('2026-03-31T23:59:59.999Z')).toContain('31')
  })
})

describe('formatMonth', () => {
  it('writes a YYYY-MM key as a Spanish month and year (UTC)', () => {
    expect(formatMonth('2026-03')).toBe('marzo de 2026')
    expect(formatMonth('2026-12')).toBe('diciembre de 2026')
  })
})

describe('formatMonthShort', () => {
  it('writes a short month and a two-digit year', () => {
    const march = formatMonthShort('2026-03')
    expect(march).toContain('mar')
    expect(march).toContain('26')
    expect(formatMonthShort('2025-12')).toContain('dic')
  })
})

describe('formatDayUtc', () => {
  const now = new Date(2026, 5, 1)
  it('writes weekday, day and month for the current year', () => {
    expect(formatDayUtc('2026-03-10T00:00:00.000Z', now)).toMatch(/^martes,? 10 de marzo$/)
  })
  it('adds the year when it is not the current one', () => {
    expect(formatDayUtc('2025-12-31T00:00:00.000Z', now)).toMatch(/^miércoles,? 31 de diciembre de 2025$/)
  })
  it('shows the UTC day even late in the evening UTC', () => {
    expect(formatDayUtc('2026-03-10T23:59:00.000Z', now)).toMatch(/10 de marzo/)
  })
})
