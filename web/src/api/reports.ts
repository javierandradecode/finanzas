import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { BudgetItem } from '@/features/budgets/budget-form'
import type { CategorySpend } from '@/features/dashboard/dashboard-data'
import { api } from './client'
import type { MonthlyProjection } from './installment-purchases'
import type { UpcomingCharge } from './subscriptions'

export interface Summary {
  month: string
  totalBalanceCents: number
  cardDebtCents: number
  incomeCents: number
  expenseCents: number
  netCents: number
  topCategories: CategorySpend[]
  budgets: { limitCents: number; spentCents: number; overBudgetCount: number }
  upcomingSubscriptions: UpcomingCharge[]
  installmentProjection: MonthlyProjection[]
}

export interface SpendingReport {
  from: string
  to: string
  totalCents: number
  items: CategorySpend[]
}

export interface MonthlyFlow {
  month: string
  incomeCents: number
  expenseCents: number
  netCents: number
}

export interface IncomeVsExpenses {
  from: string
  to: string
  months: MonthlyFlow[]
}

export type { BudgetItem }

export const useSummary = (month: string) =>
  useQuery({
    queryKey: ['reports', 'summary', month],
    queryFn: () => api<Summary>(`/reports/summary?month=${month}`),
    placeholderData: keepPreviousData,
  })

/** `from`/`to` are YYYY-MM-DD; a date-only `to` covers that whole day (UTC). */
export const useSpendingByCategory = (from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'spending', from, to],
    queryFn: () => api<SpendingReport>(`/reports/spending-by-category?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  })

/** `from`/`to` are YYYY-MM keys. */
export const useIncomeVsExpenses = (from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'flow', from, to],
    queryFn: () => api<IncomeVsExpenses>(`/reports/income-vs-expenses?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  })
