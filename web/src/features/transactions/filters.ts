import { monthRangeLocal } from '@/lib/dates'
import type { TxType } from './transaction-form'

export interface TxFilters {
  from?: string
  to?: string
  type?: TxType
  accountId?: string
  categoryId?: string
  page: number
}

const TYPES: TxType[] = ['income', 'expense', 'transfer']

/** Reads the filters from the URL; with no dates at all, the current month rules. */
export function filtersFromSearch(params: URLSearchParams, now = new Date()): TxFilters {
  const hasDates = params.has('from') || params.has('to')
  // range=all: the person emptied the dates on purpose, so do not fall back to the month
  const range = hasDates
    ? { from: params.get('from') || undefined, to: params.get('to') || undefined }
    : params.get('range') === 'all'
      ? { from: undefined, to: undefined }
      : monthRangeLocal(now)

  const type = params.get('type') as TxType | null
  const rawPage = params.get('page') ?? ''
  const page = /^\d+$/.test(rawPage) && Number(rawPage) >= 1 ? Number(rawPage) : 1

  return {
    from: range.from,
    to: range.to,
    type: type && TYPES.includes(type) ? type : undefined,
    accountId: params.get('accountId') || undefined,
    categoryId: params.get('categoryId') || undefined,
    page,
  }
}

/** Only non-empty filters go in the URL; page 1 is implicit. `range=all` marks "no date limits" (web only). */
export function filtersToSearch(f: TxFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.type) p.set('type', f.type)
  if (f.accountId) p.set('accountId', f.accountId)
  if (f.categoryId) p.set('categoryId', f.categoryId)
  if (!f.from && !f.to) p.set('range', 'all')
  if (f.page > 1) p.set('page', String(f.page))
  return p
}

/** Query string for GET /transactions. */
export function filtersToQuery(f: TxFilters, limit = 20): string {
  const p = filtersToSearch({ ...f, page: 1 })
  p.delete('page')
  p.delete('range')
  p.set('page', String(f.page))
  p.set('limit', String(limit))
  return `?${p.toString()}`
}

/** Query string for GET /transactions/export: the active filters, no paging. */
export function filtersToExportQuery(f: TxFilters): string {
  const p = filtersToSearch({ ...f, page: 1 })
  p.delete('range')
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}
