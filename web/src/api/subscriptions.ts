import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateSubscriptionPayload,
  Frequency,
  UpdateSubscriptionPayload,
} from '@/features/subscriptions/subscription-form'
import { api } from './client'

export interface Subscription {
  _id: string
  name: string
  amountCents: number
  frequency: Frequency
  nextDate: string
  anchorDay: number
  accountId?: string
  creditCardId?: string
  categoryId: string
  subcategoryId?: string
  active: boolean
  lastError?: string
  lastErrorAt?: string
}

export interface UpcomingCharge {
  subscriptionId: string
  name: string
  amountCents: number
  date: string
  overdue: boolean
  frequency: Frequency
  accountId?: string
  creditCardId?: string
  categoryId: string
}

export interface ProcessSummary {
  charged: number
  failed: { subscriptionId: string; name: string; error: string }[]
}

export const useSubscriptions = () =>
  useQuery({
    queryKey: ['subscriptions', 'list'],
    queryFn: () => api<Subscription[]>('/subscriptions'),
  })

export const useUpcoming = (days = 30) =>
  useQuery({
    queryKey: ['subscriptions', 'upcoming', days],
    queryFn: () => api<UpcomingCharge[]>(`/subscriptions/upcoming?days=${days}`),
  })

/** Runs a mutation, then refetches the given query groups. */
function useSubscriptionMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  keys: string[] = ['subscriptions'],
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  })
}

export const useCreateSubscription = () =>
  useSubscriptionMutation((body: CreateSubscriptionPayload) =>
    api<Subscription>('/subscriptions', { method: 'POST', body }),
  )

export const useUpdateSubscription = () =>
  useSubscriptionMutation(
    ({ id, ...body }: { id: string } & Partial<UpdateSubscriptionPayload>) =>
      api<Subscription>(`/subscriptions/${id}`, { method: 'PATCH', body }),
  )

/** DELETE pauses; subscriptions are never really deleted. */
export const usePauseSubscription = () =>
  useSubscriptionMutation((id: string) =>
    api<void>(`/subscriptions/${id}`, { method: 'DELETE' }),
  )

export const useReactivateSubscription = () =>
  useSubscriptionMutation((id: string) =>
    api<Subscription>(`/subscriptions/${id}`, { method: 'PATCH', body: { active: true } }),
  )

/** Charges what is due now; that creates expenses, so balances and debt change too. */
export const useProcessDue = () =>
  useSubscriptionMutation(
    () => api<ProcessSummary>('/subscriptions/process-due', { method: 'POST' }),
    ['subscriptions', 'transactions', 'accounts', 'credit-cards'],
  )
