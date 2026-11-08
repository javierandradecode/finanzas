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
