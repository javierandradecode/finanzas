import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface CreditCard {
  _id: string
  name: string
  limitCents: number
  cutoffDay: number
  paymentDay: number
  annualRatePercent: number
  debtCents: number
  isArchived: boolean
}

// Read-only for now; the cards screen (phase 9c) adds the mutations.
export const useCreditCards = (includeArchived: boolean) =>
  useQuery({
    queryKey: ['credit-cards', { includeArchived }],
    queryFn: () =>
      api<CreditCard[]>(`/credit-cards${includeArchived ? '?includeArchived=true' : ''}`),
  })
