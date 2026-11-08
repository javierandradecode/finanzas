/** A date-only `to` ("2026-03-31") means the end of that day in UTC. */
export const endOfRange = (to: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(to)
    ? new Date(`${to}T23:59:59.999Z`)
    : new Date(to);
