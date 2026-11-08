import { shiftMonth } from '@/lib/months'

export interface CategorySpend {
  categoryId: string
  name: string
  icon: string
  color: string
  totalCents: number
  count: number
}

/**
 * The biggest `n` categories as they come (the API sorts them), with every other
 * category added up under "Otras" so the slices still sum to the month's spending.
 */
export function topWithOthers(items: CategorySpend[], n = 5): CategorySpend[] {
  if (items.length <= n) return items
  const rest = items.slice(n)
  return [
    ...items.slice(0, n),
    {
      categoryId: 'others',
      name: 'Otras',
      icon: 'ellipsis',
      color: '#9ca3af',
      totalCents: rest.reduce((sum, i) => sum + i.totalCents, 0),
      count: rest.reduce((sum, i) => sum + i.count, 0),
    },
  ]
}

/** Percentage with one decimal; 0 when there is no total (no division by zero). */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0
}

/** Cents → units, ONLY to feed the chart library; money stays in cents everywhere else. */
export const chartAmount = (cents: number): number => cents / 100

/** `count` months ending at `month` (inclusive), as the income-vs-expenses endpoint wants them. */
export function lastMonthsRange(month: string, count = 6): { from: string; to: string } {
  return { from: shiftMonth(month, -(count - 1)), to: month }
}

/** 10.7 → "10,7 %" (Spanish decimal comma, at most one decimal). */
export const formatPercent = (p: number): string =>
  `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(p)} %`
