import {
  currentMonthKey,
  isMonthKey,
  monthDateRange,
  monthFromSearch,
  monthsBetween,
  nextMonth,
  previousMonth,
  shiftMonth,
} from './months'

describe('months', () => {
  it('currentMonthKey uses the local calendar, not UTC', () => {
    // 23:00 local on Jan 31 is already February in UTC when the zone is behind it.
    expect(currentMonthKey(new Date(2026, 0, 31, 23, 0))).toBe('2026-01')
    expect(currentMonthKey(new Date(2026, 10, 8))).toBe('2026-11')
    expect(currentMonthKey(new Date(2026, 11, 1, 0, 30))).toBe('2026-12')
  })

  it('previous and next cross the year boundary', () => {
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(nextMonth('2025-12')).toBe('2026-01')
    expect(previousMonth('2026-03')).toBe('2026-02')
    expect(nextMonth('2026-03')).toBe('2026-04')
    expect(nextMonth('2026-09')).toBe('2026-10')
  })

  it.each(['2026-03', '1999-12', '2026-01'])('isMonthKey accepts %s', (s) => {
    expect(isMonthKey(s)).toBe(true)
  })

  it.each(['2026-13', '2026-00', '2026-3', 'abc', '', '2026-03-01', '26-03'])(
    'isMonthKey rejects %p',
    (s) => {
      expect(isMonthKey(s)).toBe(false)
    },
  )

  it('monthsBetween is signed', () => {
    expect(monthsBetween('2026-03', '2027-03')).toBe(12)
    expect(monthsBetween('2026-03', '2025-12')).toBe(-3)
    expect(monthsBetween('2026-03', '2026-03')).toBe(0)
  })

  describe('monthFromSearch', () => {
    const now = new Date(2026, 10, 8)
    const read = (qs: string) => monthFromSearch(new URLSearchParams(qs), now)

    it('reads a valid month from the URL', () => {
      expect(read('month=2026-05')).toBe('2026-05')
    })

    it.each(['month=2026-13', 'month=abc', 'month=', ''])(
      'falls back to the current month for %p',
      (qs) => {
        expect(read(qs)).toBe('2026-11')
      },
    )
  })
})

describe('shiftMonth and monthDateRange', () => {
  it('shifts by any number of months, across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-03', -14)).toBe('2025-01')
    expect(shiftMonth('2026-03', 0)).toBe('2026-03')
  })

  it('monthDateRange gives the first and last day', () => {
    expect(monthDateRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthDateRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthDateRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthDateRange('2026-04').to).toBe('2026-04-30')
  })
})
