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
