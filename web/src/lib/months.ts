/** Months are "YYYY-MM" keys, the same format the API uses. */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const isMonthKey = (s: string): boolean => MONTH_RE.test(s)

const pad = (n: number) => String(n).padStart(2, '0')

/** The user's current month on their own calendar (not UTC). */
export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

/** Shifts a month key by `delta` months (Date handles the year rollover). */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export const previousMonth = (key: string): string => shiftMonth(key, -1)
export const nextMonth = (key: string): string => shiftMonth(key, 1)

/** First and last day of a month as YYYY-MM-DD (what the report endpoints take). */
export function monthDateRange(key: string): { from: string; to: string } {
  const [y, m] = key.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${key}-01`, to: `${key}-${pad(lastDay)}` }
}

/** The month a YYYY-MM-DD range covers when it is exactly one whole month; otherwise null. */
export function monthOfRange(from?: string, to?: string): string | null {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null
  const key = from.slice(0, 7)
  if (!isMonthKey(key)) return null
  const whole = monthDateRange(key)
  return from === whole.from && to === whole.to ? key : null
}

/** Signed number of months from `from` to `to`. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** The `month` of the URL if it is valid; otherwise the current month. */
export function monthFromSearch(params: URLSearchParams, now = new Date()): string {
  const value = params.get('month') ?? ''
  return isMonthKey(value) ? value : currentMonthKey(now)
}
