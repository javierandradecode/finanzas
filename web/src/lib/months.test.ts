import {
  currentMonthKey,
  isMonthKey,
  monthFromSearch,
  monthsBetween,
  nextMonth,
  previousMonth,
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
