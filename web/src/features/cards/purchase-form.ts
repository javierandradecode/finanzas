import { z } from 'zod'
import { isValidDateText } from '@/lib/dates'
import { parseIntText, parseRate } from '@/lib/numbers'

export interface PurchaseFormValues {
  description: string
  categoryId: string
  subcategoryId: string
  /** null = empty, NaN = text that is not an amount (see MoneyInput). */
  totalCents: number | null
  installments: string
  /** Empty means interest-free. */
  annualRatePercent: string
  /** YYYY-MM-DD */
  startDate: string
}

export const purchaseSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Ingresa una descripción')
      .max(200, 'La descripción admite hasta 200 caracteres'),
    categoryId: z.string().min(1, 'Elige una categoría'),
    subcategoryId: z.string(),
    totalCents: z.number({ message: 'Monto no válido' }).nullable(),
    installments: z.string().refine((s) => {
      const n = parseIntText(s)
      return n !== null && n >= 2 && n <= 60
    }, 'Entre 2 y 60 cuotas'),
    annualRatePercent: z.string().refine((s) => {
      if (s.trim() === '') return true
      const rate = parseRate(s)
      return rate !== null && rate <= 100
    }, 'Tasa entre 0 y 100'),
    startDate: z.string().refine(isValidDateText, 'Fecha no válida'),
  })
  .superRefine((v, ctx) => {
    if (v.totalCents === null) {
      ctx.addIssue({ code: 'custom', path: ['totalCents'], message: 'Ingresa un monto' })
    } else if (v.totalCents < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['totalCents'],
        message: 'El monto debe ser mayor que 0',
      })
    }
  })

export interface CreatePurchasePayload {
  creditCardId: string
  description: string
  categoryId: string
  subcategoryId?: string
  totalCents: number
  installments: number
  annualRatePercent: number
  startDate: string
}

export function toPurchasePayload(
  v: PurchaseFormValues,
  creditCardId: string,
): CreatePurchasePayload {
  return {
    creditCardId,
    description: v.description.trim(),
    categoryId: v.categoryId,
    ...(v.subcategoryId ? { subcategoryId: v.subcategoryId } : {}),
    totalCents: v.totalCents as number,
    installments: parseIntText(v.installments) as number,
    annualRatePercent: parseRate(v.annualRatePercent) ?? 0,
    startDate: v.startDate,
  }
}

export const payInstallmentSchema = z.object({
  accountId: z.string().min(1, 'Elige una cuenta'),
  date: z.string().refine(isValidDateText, 'Fecha no válida'),
})

export type PayInstallmentValues = z.infer<typeof payInstallmentSchema>
