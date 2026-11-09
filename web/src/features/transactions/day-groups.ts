/**
 * Splits a list (already sorted by date) into runs of the same UTC day. Only
 * neighbours are merged: the API sorts by date, so a day never comes back later.
 */
export function groupByDay<T extends { date: string }>(items: T[]) {
  const groups: { day: string; items: T[] }[] = []
  for (const item of items) {
    const day = item.date.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}
