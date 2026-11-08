import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export type AccountType = 'cash' | 'savings' | 'checking'

export interface Account {
  _id: string
  type: AccountType
  name: string
  balanceCents: number
  isArchived: boolean
}

export const useAccounts = (includeArchived: boolean) =>
  useQuery({
    queryKey: ['accounts', { includeArchived }],
    queryFn: () =>
      api<Account[]>(`/accounts${includeArchived ? '?includeArchived=true' : ''}`),
  })

/** Runs a mutation, then refetches every ['accounts'] query. */
function useAccountMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export const useCreateAccount = () =>
  useAccountMutation(
    (body: { type: AccountType; name: string; initialBalanceCents?: number }) =>
      api<Account>('/accounts', { method: 'POST', body }),
  )

export const useUpdateAccount = () =>
  useAccountMutation(
    ({
      id,
      ...body
    }: {
      id: string
      name?: string
      type?: AccountType
      isArchived?: boolean
    }) => api<Account>(`/accounts/${id}`, { method: 'PATCH', body }),
  )

export const useArchiveAccount = () =>
  useAccountMutation((id: string) =>
    api<void>(`/accounts/${id}`, { method: 'DELETE' }),
  )
