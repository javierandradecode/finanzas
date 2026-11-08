import {
  fromTransaction,
  toCreatePayload,
  toUpdatePayload,
  transactionSchema,
  type TransactionFormValues,
} from './transaction-form'

const base: TransactionFormValues = {
  type: 'expense',
  amountCents: 1500,
  date: '2026-03-15',
  source: 'account:a1',
  destination: '',
  categoryId: 'c1',
  subcategoryId: '',
  note: '',
}

const messages = (v: Partial<TransactionFormValues>) => {
  const r = transactionSchema.safeParse({ ...base, ...v })
  return r.success ? [] : r.error.issues.map((i) => i.message)
}
const paths = (v: Partial<TransactionFormValues>) => {
  const r = transactionSchema.safeParse({ ...base, ...v })
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('transactionSchema', () => {
  it('accepts an expense paid with an account or a card', () => {
    expect(messages({})).toEqual([])
    expect(messages({ source: 'card:k1' })).toEqual([])
  })

  it('accepts an income into an account but not into a card', () => {
    const income = { type: 'income' as const, categoryId: 'c9' }
    expect(messages(income)).toEqual([])
    expect(paths({ ...income, source: 'card:k1' })).toContain('source')
  })

  it('requires a category for expenses and incomes, not for transfers', () => {
    expect(messages({ categoryId: '' })).toContain('Elige una categoría')
    expect(messages({ type: 'income', categoryId: '' })).toContain('Elige una categoría')
    expect(
      messages({ type: 'transfer', categoryId: '', destination: 'account:a2' }),
    ).toEqual([])
  })

  it('transfers need a destination different from the origin', () => {
    const t = { type: 'transfer' as const, categoryId: '' }
    expect(messages({ ...t, destination: '' })).toContain('Elige un destino')
    expect(messages({ ...t, destination: 'account:a1' })).toContain(
      'El destino debe ser distinto del origen',
    )
    expect(messages({ ...t, destination: 'account:a2' })).toEqual([])
    expect(messages({ ...t, destination: 'card:k1' })).toEqual([]) // pays a card
    expect(paths({ ...t, source: 'card:k1', destination: 'account:a2' })).toContain('source')
  })

  it('requires a source', () => {
    expect(paths({ source: '' })).toContain('source')
  })

  it('validates the amount', () => {
    expect(messages({ amountCents: null })).toContain('Ingresa un monto')
    expect(messages({ amountCents: Number.NaN })).toContain('Monto no válido')
    expect(messages({ amountCents: 0 })).toContain('El monto debe ser mayor que 0')
    expect(messages({ amountCents: -5 })).toContain('El monto debe ser mayor que 0')
  })

  it('validates the date', () => {
    expect(messages({ date: '' })).toContain('Fecha no válida')
    expect(messages({ date: '2026-02-31' })).toContain('Fecha no válida')
    expect(messages({ date: '15/03/2026' })).toContain('Fecha no válida')
  })

  it('limits the note to 500 characters', () => {
    expect(messages({ note: 'x'.repeat(500) })).toEqual([])
    expect(messages({ note: 'x'.repeat(501) })).toContain(
      'La nota admite hasta 500 caracteres',
    )
  })
})

describe('toCreatePayload', () => {
  it('expense with an account', () => {
    expect(toCreatePayload({ ...base, note: ' Pan ' })).toEqual({
      type: 'expense',
      amountCents: 1500,
      date: '2026-03-15',
      accountId: 'a1',
      categoryId: 'c1',
      note: 'Pan',
    })
  })

  it('expense with a card and a subcategory', () => {
    expect(
      toCreatePayload({ ...base, source: 'card:k1', subcategoryId: 's1' }),
    ).toEqual({
      type: 'expense',
      amountCents: 1500,
      date: '2026-03-15',
      creditCardId: 'k1',
      categoryId: 'c1',
      subcategoryId: 's1',
    })
  })

  it('income', () => {
    expect(toCreatePayload({ ...base, type: 'income', categoryId: 'c9' })).toEqual({
      type: 'income',
      amountCents: 1500,
      date: '2026-03-15',
      accountId: 'a1',
      categoryId: 'c9',
    })
  })

  it('transfer to an account and to a card (no category)', () => {
    const t = { ...base, type: 'transfer' as const, categoryId: 'ignored' }
    expect(toCreatePayload({ ...t, destination: 'account:a2' })).toEqual({
      type: 'transfer',
      amountCents: 1500,
      date: '2026-03-15',
      accountId: 'a1',
      toAccountId: 'a2',
    })
    expect(toCreatePayload({ ...t, destination: 'card:k1' })).toEqual({
      type: 'transfer',
      amountCents: 1500,
      date: '2026-03-15',
      accountId: 'a1',
      toCreditCardId: 'k1',
    })
  })
})

describe('toUpdatePayload', () => {
  it('sends null for every field that does not apply (expense → transfer)', () => {
    const p = toUpdatePayload({
      ...base,
      type: 'transfer',
      categoryId: 'c1',
      subcategoryId: 's1',
      source: 'account:a1',
      destination: 'account:a2',
    })
    expect(p).toEqual({
      type: 'transfer',
      amountCents: 1500,
      date: '2026-03-15',
      accountId: 'a1',
      toAccountId: 'a2',
      creditCardId: null,
      toCreditCardId: null,
      categoryId: null,
      subcategoryId: null,
      note: null,
    })
  })

  it('moves an expense from an account to a card', () => {
    const p = toUpdatePayload({ ...base, source: 'card:k1', note: 'hola' })
    expect(p).toMatchObject({
      accountId: null,
      creditCardId: 'k1',
      toAccountId: null,
      toCreditCardId: null,
      categoryId: 'c1',
      subcategoryId: null,
      note: 'hola',
    })
  })
})

describe('fromTransaction', () => {
  const cases = [
    { type: 'expense', amountCents: 100, date: '2026-03-15T00:00:00.000Z', accountId: 'a1', categoryId: 'c1', subcategoryId: 's1', note: 'n' },
    { type: 'expense', amountCents: 100, date: '2026-03-15T00:00:00.000Z', creditCardId: 'k1', categoryId: 'c1' },
    { type: 'income', amountCents: 250, date: '2026-03-01T00:00:00.000Z', accountId: 'a1', categoryId: 'c2' },
    { type: 'transfer', amountCents: 999, date: '2026-03-31T00:00:00.000Z', accountId: 'a1', toAccountId: 'a2' },
    { type: 'transfer', amountCents: 999, date: '2026-03-31T00:00:00.000Z', accountId: 'a1', toCreditCardId: 'k1' },
  ] as const

  it.each(cases)('round-trips %#', (tx) => {
    const values = fromTransaction(tx)
    expect(values.date).toBe(tx.date.slice(0, 10))
    expect(values.amountCents).toBe(tx.amountCents)
    expect(transactionSchema.safeParse(values).success).toBe(true)
    const create = toCreatePayload(values)
    expect(create.accountId).toBe('accountId' in tx ? tx.accountId : undefined)
    expect(create.creditCardId).toBe('creditCardId' in tx ? tx.creditCardId : undefined)
    expect(create.toAccountId).toBe('toAccountId' in tx ? tx.toAccountId : undefined)
    expect(create.toCreditCardId).toBe('toCreditCardId' in tx ? tx.toCreditCardId : undefined)
    expect(create.categoryId).toBe('categoryId' in tx ? tx.categoryId : undefined)
  })
})
