import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreatePurchasePayload } from '@/features/cards/purchase-form'
import { api } from './client'

export type { CreatePurchasePayload }

export interface ScheduleRow {
  number: number
  dueDate: string
  principalCents: number
  interestCents: number
  paymentCents: number
  remainingPrincipalCents: number
  paid: boolean
}

export interface InstallmentPurchase {
  _id: string
  creditCardId: string
  description: string
  categoryId: string
  subcategoryId?: string
  totalCents: number
  installments: number
  annualRatePercent: number
  startDate: string
  firstDueDate: string
  paymentDay: number
  paidInstallments: number
  purchaseTransactionId: string
  isPaidOff: boolean
  schedule: ScheduleRow[]
}

export interface MonthlyProjection {
  /** YYYY-MM (UTC) */
  month: string
  principalCents: number
  interestCents: number
  paymentCents: number
  count: number
}

export const usePurchases = (creditCardId?: string) =>
  useQuery({
    queryKey: ['installment-purchases', { creditCardId }],
    queryFn: () =>
      api<InstallmentPurchase[]>(
        `/installment-purchases${creditCardId ? `?creditCardId=${creditCardId}` : ''}`,
      ),
  })

export const useProjection = (months = 12) =>
  useQuery({
    queryKey: ['installment-purchases', 'projection', months],
    queryFn: () =>
      api<MonthlyProjection[]>(`/installment-purchases/projection?months=${months}`),
  })

/**
 * Creating, paying or deleting a purchase moves card debt, account balances and
 * transactions; editing its text only touches the purchases themselves.
 */
function usePurchaseMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  keys: string[],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
}

const MONEY_KEYS = ['installment-purchases', 'credit-cards', 'accounts', 'transactions']

export const useCreatePurchase = () =>
  usePurchaseMutation(
    (body: CreatePurchasePayload) =>
      api<InstallmentPurchase>('/installment-purchases', { method: 'POST', body }),
    MONEY_KEYS,
  )

export const useUpdatePurchase = () =>
  usePurchaseMutation(
    ({
      id,
      ...body
    }: {
      id: string
      description?: string
      categoryId?: string
      subcategoryId?: string | null
    }) => api<InstallmentPurchase>(`/installment-purchases/${id}`, { method: 'PATCH', body }),
    ['installment-purchases'],
  )

export const useDeletePurchase = () =>
  usePurchaseMutation(
    (id: string) => api<void>(`/installment-purchases/${id}`, { method: 'DELETE' }),
    MONEY_KEYS,
  )

export const usePayInstallment = () =>
  usePurchaseMutation(
    ({ id, ...body }: { id: string; accountId: string; date?: string }) =>
      api<InstallmentPurchase>(`/installment-purchases/${id}/pay`, { method: 'POST', body }),
    MONEY_KEYS,
  )
