import { z } from 'zod'
import { parseIntText, parseRate } from '@/lib/numbers'

export interface CardFormValues {
  name: string
  /** null = empty, NaN = text that is not an amount (see MoneyInput). */
  limitCents: number | null
  cutoffDay: string
  paymentDay: string
  /** Empty means 0 %. */
  annualRatePercent: string
  /** Create only; empty means no debt. */
  initialDebtCents: number | null
}

const day = z.string().refine((s) => {
  const n = parseIntText(s)
  return n !== null && n >= 1 && n <= 31
}, 'Elige un día entre 1 y 31')

export const cardSchema = z
  .object({
    name: z.string().trim().min(1, 'Ingresa un nombre'),
    limitCents: z.number({ message: 'Monto no válido' }).nullable(),
    cutoffDay: day,
    paymentDay: day,
    annualRatePercent: z
      .string()
      .refine((s) => s.trim() === '' || parseRate(s) !== null, 'Tasa no válida'),
    initialDebtCents: z.number({ message: 'Monto no válido' }).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.limitCents === null) {
      ctx.addIssue({ code: 'custom', path: ['limitCents'], message: 'Ingresa un cupo' })
    } else if (v.limitCents < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['limitCents'],
        message: 'El cupo debe ser mayor que 0',
      })
    }
  })

export interface CardPayload {
  name: string
  limitCents: number
  cutoffDay: number
  paymentDay: number
  annualRatePercent: number
  initialDebtCents?: number
}

export function toCardPayload(v: CardFormValues, mode: 'create' | 'update'): CardPayload {
  const payload: CardPayload = {
    name: v.name.trim(),
    limitCents: v.limitCents as number,
    cutoffDay: parseIntText(v.cutoffDay) as number,
    paymentDay: parseIntText(v.paymentDay) as number,
    annualRatePercent: parseRate(v.annualRatePercent) ?? 0,
  }
  if (mode === 'create' && v.initialDebtCents !== null) {
    payload.initialDebtCents = v.initialDebtCents
  }
  return payload
}
