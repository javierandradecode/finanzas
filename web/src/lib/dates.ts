const pad = (n: number) => String(n).padStart(2, '0')

const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** Today on the user's own calendar (not UTC), as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  return ymd(now.getFullYear(), now.getMonth(), now.getDate())
}

/** First and last day of the user's current month, as YYYY-MM-DD. */
export function monthRangeLocal(now = new Date()): { from: string; to: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  return { from: ymd(y, m, 1), to: ymd(y, m, new Date(y, m + 1, 0).getDate()) }
}

/** Transactions are stored at UTC midnight, so show the UTC day (e.g. "15 mar 2026"). */
export function formatDateUtc(iso: string): string {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

/** "martes 10 de marzo" (UTC day); the year only when it is not the current one. */
export function formatDayUtc(iso: string, now = new Date()): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getUTCFullYear() === now.getFullYear() ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/** A real YYYY-MM-DD date as a Date at local midnight (what a calendar works with); undefined if it is not one. */
export function parseYmd(s: string): Date | undefined {
  if (!isValidDateText(s)) return undefined
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The inverse: a Date's day on the local calendar, as YYYY-MM-DD (never goes through UTC). */
export const toYmd = (date: Date): string =>
  ymd(date.getFullYear(), date.getMonth(), date.getDate())

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isValidDateText(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** "2026-03" → "marzo de 2026" (the keys the API uses for months are UTC). */
export function formatMonth(key: string): string {
  return new Intl.DateTimeFormat('es', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${key}-01T00:00:00Z`))
}

/** "2026-03" → "mar 26", for chart axes. */
export function formatMonthShort(key: string): string {
  return new Intl.DateTimeFormat('es', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${key}-01T00:00:00Z`))
}
