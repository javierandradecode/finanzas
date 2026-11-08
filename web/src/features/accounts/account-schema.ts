import { z } from 'zod'
import type { AccountType } from '@/api/accounts'

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Efectivo',
  savings: 'Ahorros',
  checking: 'Corriente',
}

export const accountSchema = z.object({
  name: z.string().trim().min(1, 'Ingresa un nombre'),
  type: z.enum(['cash', 'savings', 'checking']),
  // null = left empty (balance 0); NaN = text that is not an amount
  initialBalanceCents: z
    .number({ message: 'Monto no válido' })
    .int('Monto no válido')
    .nullable(),
})

export type AccountFormValues = z.infer<typeof accountSchema>
