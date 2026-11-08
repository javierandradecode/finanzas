import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { BudgetItem, CopyResult } from '@/features/budgets/budget-form'
import { api } from './client'

export interface BudgetReport {
  month: string
  items: BudgetItem[]
  totals: { limitCents: number; spentCents: number; overBudgetCount: number }
}

/** Budgets with what was spent on each category, computed by the API. */
export const useBudgetReport = (month: string) =>
  useQuery({
    queryKey: ['budgets', 'report', month],
    queryFn: () => api<BudgetReport>(`/reports/budget-vs-spent?month=${month}`),
    placeholderData: keepPreviousData,
  })

/** Runs a mutation, then refetches every ['budgets'] query. */
function useBudgetMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export const useCreateBudget = () =>
  useBudgetMutation((body: { categoryId: string; month: string; limitCents: number }) =>
    api<unknown>('/budgets', { method: 'POST', body }),
  )

export const useUpdateBudget = () =>
  useBudgetMutation(({ id, ...body }: { id: string; limitCents: number }) =>
    api<unknown>(`/budgets/${id}`, { method: 'PATCH', body }),
  )

/** A real delete (budgets are not archived). */
export const useDeleteBudget = () =>
  useBudgetMutation((id: string) => api<void>(`/budgets/${id}`, { method: 'DELETE' }))

export const useCopyBudgets = () =>
  useBudgetMutation((body: { from: string; to: string }) =>
    api<CopyResult>('/budgets/copy', { method: 'POST', body }),
  )
