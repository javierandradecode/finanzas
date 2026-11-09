import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  filtersToExportQuery,
  filtersToQuery,
  type TxFilters,
} from '@/features/transactions/filters'
import type {
  CreatePayload,
  TxType,
  UpdatePayload,
} from '@/features/transactions/transaction-form'
import { api, apiDownload } from './client'

export interface Transaction {
  _id: string
  type: TxType
  amountCents: number
  date: string
  accountId?: string
  toAccountId?: string
  creditCardId?: string
  toCreditCardId?: string
  categoryId?: string
  subcategoryId?: string
  note?: string
  source: 'manual' | 'subscription' | 'installment'
  subscriptionId?: string
  installmentPurchaseId?: string
}

export interface TransactionPage {
  items: Transaction[]
  total: number
  page: number
  limit: number
}

export const useTransactions = (filters: TxFilters) =>
  useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api<TransactionPage>(`/transactions${filtersToQuery(filters)}`),
    placeholderData: keepPreviousData,
  })

export interface TransactionSummary {
  incomeCents: number
  expenseCents: number
}

/** Income and expense totals of everything the filters match (not just the visible page). */
export const useTransactionsSummary = (filters: TxFilters) =>
  useQuery({
    // the page does not change the totals, so it is not part of the key
    queryKey: ['transactions', 'summary', { ...filters, page: 1 }],
    queryFn: () =>
      api<TransactionSummary>(`/transactions/summary${filtersToExportQuery(filters)}`),
    placeholderData: keepPreviousData,
  })

/** A transaction moves balances and card debt, so those lists must refetch too. */
function useTransactionMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        ['transactions', 'accounts', 'credit-cards'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  })
}

export const useCreateTransaction = () =>
  useTransactionMutation((body: CreatePayload) =>
    api<Transaction>('/transactions', { method: 'POST', body }),
  )

export const useUpdateTransaction = () =>
  useTransactionMutation(
    ({ id, ...body }: { id: string } & Partial<UpdatePayload>) =>
      api<Transaction>(`/transactions/${id}`, { method: 'PATCH', body }),
  )

export const useDeleteTransaction = () =>
  useTransactionMutation((id: string) =>
    api<void>(`/transactions/${id}`, { method: 'DELETE' }),
  )

/** Downloads the CSV of the transactions matching the filters. */
export const useExportTransactions = () =>
  useMutation({
    mutationFn: async (filters: TxFilters) => {
      const { blob, filename } = await apiDownload(
        `/transactions/export${filtersToExportQuery(filters)}`,
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    },
  })
