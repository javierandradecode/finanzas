import { z } from 'zod'
import { isValidDateText } from '@/lib/dates'

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
}

/** For "9,99 $ / mes". */
export const FREQUENCY_UNITS: Record<Frequency, string> = {
  weekly: 'semana',
  monthly: 'mes',
  quarterly: 'trimestre',
  semiannual: 'semestre',
  yearly: 'año',
}

/** Approximate monthly cost (a week is 52/12 of a month). */
export function monthlyEquivalentCents(amountCents: number, frequency: Frequency): number {
  const perMonth: Record<Frequency, number> = {
    weekly: (amountCents * 52) / 12,
    monthly: amountCents,
    quarterly: amountCents / 3,
    semiannual: amountCents / 6,
    yearly: amountCents / 12,
  }
  return Math.round(perMonth[frequency])
}

export function summarize(
  subs: { amountCents: number; frequency: Frequency; active: boolean }[],
): { activeCount: number; monthlyCents: number } {
  const active = subs.filter((s) => s.active)
  return {
    activeCount: active.length,
    monthlyCents: active.reduce((sum, s) => sum + monthlyEquivalentCents(s.amountCents, s.frequency), 0),
  }
}

export interface SubscriptionFormValues {
  name: string
  /** null = empty, NaN = text that is not an amount (see MoneyInput). */
  amountCents: number | null
  frequency: Frequency
  /** YYYY-MM-DD; a past date is allowed (the overdue charges get collected). */
  nextDate: string
  /** "account:<id>" or "card:<id>" */
  payer: string
  categoryId: string
  subcategoryId: string
}

export const subscriptionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Ingresa un nombre')
      .max(120, 'El nombre admite hasta 120 caracteres'),
    amountCents: z.number({ message: 'Monto no válido' }).nullable(),
    frequency: z.enum(FREQUENCIES),
    nextDate: z.string().refine(isValidDateText, 'Fecha no válida'),
    payer: z.string().min(1, 'Elige con qué se paga'),
    categoryId: z.string().min(1, 'Elige una categoría'),
    subcategoryId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.amountCents === null) {
      ctx.addIssue({ code: 'custom', path: ['amountCents'], message: 'Ingresa un monto' })
    } else if (v.amountCents < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountCents'],
        message: 'El monto debe ser mayor que 0',
      })
    }
  })

/** `today` is YYYY-MM-DD on the user's calendar. */
export const isPastDate = (date: string, today: string): boolean => date < today

export interface CreateSubscriptionPayload {
  name: string
  amountCents: number
  frequency: Frequency
  nextDate: string
  accountId?: string
  creditCardId?: string
  categoryId: string
  subcategoryId?: string
}

/** Every key present; `null` clears the field on the server. */
export interface UpdateSubscriptionPayload {
  name: string
  amountCents: number
  frequency: Frequency
  nextDate: string
  accountId: string | null
  creditCardId: string | null
  categoryId: string
  subcategoryId: string | null
}

const refId = (ref: string, kind: 'account' | 'card') =>
  ref.startsWith(`${kind}:`) ? ref.slice(kind.length + 1) : null

export function toUpdatePayload(v: SubscriptionFormValues): UpdateSubscriptionPayload {
  return {
    name: v.name.trim(),
    amountCents: v.amountCents as number,
    frequency: v.frequency,
    nextDate: v.nextDate,
    accountId: refId(v.payer, 'account'),
    creditCardId: refId(v.payer, 'card'),
    categoryId: v.categoryId,
    subcategoryId: v.subcategoryId || null,
  }
}

export function toCreatePayload(v: SubscriptionFormValues): CreateSubscriptionPayload {
  return Object.fromEntries(
    Object.entries(toUpdatePayload(v)).filter(([, value]) => value !== null),
  ) as unknown as CreateSubscriptionPayload
}

export function fromSubscription(s: {
  name: string
  amountCents: number
  frequency: Frequency
  nextDate: string
  accountId?: string
  creditCardId?: string
  categoryId: string
  subcategoryId?: string
}): SubscriptionFormValues {
  return {
    name: s.name,
    amountCents: s.amountCents,
    frequency: s.frequency,
    nextDate: s.nextDate.slice(0, 10),
    payer: s.accountId ? `account:${s.accountId}` : s.creditCardId ? `card:${s.creditCardId}` : '',
    categoryId: s.categoryId,
    subcategoryId: s.subcategoryId ?? '',
  }
}
