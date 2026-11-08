import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { CardPayload } from '@/features/cards/card-form'
import { api } from './client'
import type { Transaction } from './transactions'

export interface CreditCard {
  _id: string
  name: string
  limitCents: number
  cutoffDay: number
  paymentDay: number
  annualRatePercent: number
  debtCents: number
  availableCents: number
  isArchived: boolean
}

export interface DueInstallment {
  purchaseId: string
  description: string
  number: number
  of: number
  dueDate: string
  principalCents: number
  interestCents: number
  paymentCents: number
}

export interface Statement {
  cardId: string
  period: { start: string; end: string }
  paymentDueDate: string
  purchases: Transaction[]
  payments: Transaction[]
  installmentsDue: DueInstallment[]
  totals: {
    purchasesCents: number
    paymentsCents: number
    installmentsDueCents: number
  }
  debtCents: number
  availableCents: number
}

export const useCreditCards = (includeArchived: boolean) =>
  useQuery({
    queryKey: ['credit-cards', { includeArchived }],
    queryFn: () =>
      api<CreditCard[]>(`/credit-cards${includeArchived ? '?includeArchived=true' : ''}`),
  })

/** `date` = any ISO date inside the wanted period; omitted = the current one. */
export const useStatement = (cardId: string, date?: string) =>
  useQuery({
    queryKey: ['credit-cards', cardId, 'statement', date ?? 'today'],
    queryFn: () =>
      api<Statement>(`/credit-cards/${cardId}/statement${date ? `?date=${date}` : ''}`),
    placeholderData: keepPreviousData,
  })

/** Runs a mutation, then refetches every ['credit-cards'] query (lists and statements). */
function useCardMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credit-cards'] }),
  })
}

export const useCreateCard = () =>
  useCardMutation((body: CardPayload) =>
    api<CreditCard>('/credit-cards', { method: 'POST', body }),
  )

export const useUpdateCard = () =>
  useCardMutation(
    ({
      id,
      ...body
    }: { id: string; isArchived?: boolean } & Partial<Omit<CardPayload, 'initialDebtCents'>>) =>
      api<CreditCard>(`/credit-cards/${id}`, { method: 'PATCH', body }),
  )

export const useArchiveCard = () =>
  useCardMutation((id: string) => api<void>(`/credit-cards/${id}`, { method: 'DELETE' }))
