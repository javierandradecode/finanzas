import { z } from 'zod'
import { isValidDateText } from '@/lib/dates'

export type TxType = 'income' | 'expense' | 'transfer'

export interface TransactionFormValues {
  type: TxType
  /** null = empty, NaN = text that is not an amount (see MoneyInput). */
  amountCents: number | null
  /** YYYY-MM-DD */
  date: string
  /** "account:<id>" or "card:<id>": where the money comes from / is charged. */
  source: string
  /** Transfers only: "account:<id>" or "card:<id>" (paying a card). */
  destination: string
  categoryId: string
  subcategoryId: string
  note: string
}

export const transactionSchema = z
  .object({
    type: z.enum(['income', 'expense', 'transfer']),
    amountCents: z.number({ message: 'Monto no válido' }).nullable(),
    date: z.string().refine(isValidDateText, 'Fecha no válida'),
    source: z.string(),
    destination: z.string(),
    categoryId: z.string(),
    subcategoryId: z.string(),
    note: z.string().max(500, 'La nota admite hasta 500 caracteres'),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })

    if (v.amountCents === null) add('amountCents', 'Ingresa un monto')
    else if (v.amountCents < 1) add('amountCents', 'El monto debe ser mayor que 0')

    if (!v.source) {
      add('source', v.type === 'expense' ? 'Elige una cuenta o tarjeta' : 'Elige una cuenta')
    } else if (v.type !== 'expense' && v.source.startsWith('card:')) {
      add('source', 'Elige una cuenta')
    }

    if (v.type === 'transfer') {
      if (!v.destination) add('destination', 'Elige un destino')
      else if (v.destination === v.source) {
        add('destination', 'El destino debe ser distinto del origen')
      }
    } else if (!v.categoryId) {
      add('categoryId', 'Elige una categoría')
    }
  })

export interface CreatePayload {
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
}

/** Every key present; `null` clears the field on the server. */
export interface UpdatePayload {
  type: TxType
  amountCents: number
  date: string
  accountId: string | null
  toAccountId: string | null
  creditCardId: string | null
  toCreditCardId: string | null
  categoryId: string | null
  subcategoryId: string | null
  note: string | null
}

const refId = (ref: string, kind: 'account' | 'card') =>
  ref.startsWith(`${kind}:`) ? ref.slice(kind.length + 1) : null

/** The fields that make sense for the type; everything else is null. */
function resolve(v: TransactionFormValues): UpdatePayload {
  const transfer = v.type === 'transfer'
  const category = transfer ? null : v.categoryId || null
  return {
    type: v.type,
    amountCents: v.amountCents as number,
    date: v.date,
    accountId: refId(v.source, 'account'),
    creditCardId: v.type === 'expense' ? refId(v.source, 'card') : null,
    toAccountId: transfer ? refId(v.destination, 'account') : null,
    toCreditCardId: transfer ? refId(v.destination, 'card') : null,
    categoryId: category,
    subcategoryId: category ? v.subcategoryId || null : null,
    note: v.note.trim() || null,
  }
}

export function toUpdatePayload(v: TransactionFormValues): UpdatePayload {
  return resolve(v)
}

export function toCreatePayload(v: TransactionFormValues): CreatePayload {
  const full = resolve(v)
  return Object.fromEntries(
    Object.entries(full).filter(([, value]) => value !== null),
  ) as unknown as CreatePayload
}

export function fromTransaction(tx: {
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
}): TransactionFormValues {
  const ref = (accountId?: string, cardId?: string) =>
    accountId ? `account:${accountId}` : cardId ? `card:${cardId}` : ''
  return {
    type: tx.type,
    amountCents: tx.amountCents,
    date: tx.date.slice(0, 10),
    source: ref(tx.accountId, tx.creditCardId),
    destination: ref(tx.toAccountId, tx.toCreditCardId),
    categoryId: tx.categoryId ?? '',
    subcategoryId: tx.subcategoryId ?? '',
    note: tx.note ?? '',
  }
}
