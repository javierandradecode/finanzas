import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  FREQUENCY_UNITS,
  fromSubscription,
  isPastDate,
  monthlyEquivalentCents,
  subscriptionSchema,
  summarize,
  toCreatePayload,
  toUpdatePayload,
  type SubscriptionFormValues,
} from './subscription-form'

const ok: SubscriptionFormValues = {
  name: ' Netflix ',
  amountCents: 999,
  frequency: 'monthly',
  nextDate: '2026-03-15',
  payer: 'account:a1',
  categoryId: 'c1',
  subcategoryId: '',
}

const messages = (v: Partial<SubscriptionFormValues>) => {
  const r = subscriptionSchema.safeParse({ ...ok, ...v })
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('frequencies', () => {
  it('has a label and a unit for each one, in order', () => {
    expect(FREQUENCIES).toEqual(['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'])
    expect(FREQUENCIES.map((f) => FREQUENCY_LABELS[f])).toEqual([
      'Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual',
    ])
    expect(FREQUENCIES.map((f) => FREQUENCY_UNITS[f])).toEqual([
      'semana', 'mes', 'trimestre', 'semestre', 'año',
    ])
  })
})

describe('monthlyEquivalentCents', () => {
  it.each([
    [1000, 'weekly', 4333],
    [100, 'weekly', 433],
    [999, 'monthly', 999],
    [3000, 'quarterly', 1000],
    [600, 'semiannual', 100],
    [1200, 'yearly', 100],
    [1000, 'yearly', 83],
  ] as const)('%i cents %s → %i per month', (amount, frequency, expected) => {
    expect(monthlyEquivalentCents(amount, frequency)).toBe(expected)
  })
})

describe('summarize', () => {
  it('counts and adds up only active subscriptions', () => {
    expect(
      summarize([
        { amountCents: 999, frequency: 'monthly', active: true },
        { amountCents: 1200, frequency: 'yearly', active: true },
        { amountCents: 5000, frequency: 'monthly', active: false },
      ]),
    ).toEqual({ activeCount: 2, monthlyCents: 1099 })
  })

  it('is zero for an empty list', () => {
    expect(summarize([])).toEqual({ activeCount: 0, monthlyCents: 0 })
  })
})

describe('subscriptionSchema', () => {
  it('accepts valid input with an account or a card', () => {
    expect(messages({})).toEqual([])
    expect(messages({ payer: 'card:k1' })).toEqual([])
  })

  it('validates the name', () => {
    expect(messages({ name: '  ' })).toContain('Ingresa un nombre')
    expect(messages({ name: 'x'.repeat(121) })).toContain('El nombre admite hasta 120 caracteres')
    expect(messages({ name: 'x'.repeat(120) })).toEqual([])
  })

  it('validates the amount', () => {
    expect(messages({ amountCents: null })).toContain('Ingresa un monto')
    expect(messages({ amountCents: Number.NaN })).toContain('Monto no válido')
    expect(messages({ amountCents: 0 })).toContain('El monto debe ser mayor que 0')
  })

  it('validates the date, accepting past dates', () => {
    expect(messages({ nextDate: '2026-02-31' })).toContain('Fecha no válida')
    expect(messages({ nextDate: '' })).toContain('Fecha no válida')
    expect(messages({ nextDate: '2020-01-01' })).toEqual([])
  })

  it('requires a payer and a category', () => {
    expect(messages({ payer: '' })).toContain('Elige con qué se paga')
    expect(messages({ categoryId: '' })).toContain('Elige una categoría')
  })
})

describe('isPastDate', () => {
  it('is true only for days before today', () => {
    expect(isPastDate('2026-03-01', '2026-03-02')).toBe(true)
    expect(isPastDate('2026-03-02', '2026-03-02')).toBe(false)
    expect(isPastDate('2026-03-03', '2026-03-02')).toBe(false)
  })
})

describe('payloads', () => {
  it('create with an account', () => {
    expect(toCreatePayload(ok)).toEqual({
      name: 'Netflix',
      amountCents: 999,
      frequency: 'monthly',
      nextDate: '2026-03-15',
      accountId: 'a1',
      categoryId: 'c1',
    })
  })

  it('create with a card and a subcategory', () => {
    expect(toCreatePayload({ ...ok, payer: 'card:k1', subcategoryId: 's1' })).toEqual({
      name: 'Netflix',
      amountCents: 999,
      frequency: 'monthly',
      nextDate: '2026-03-15',
      creditCardId: 'k1',
      categoryId: 'c1',
      subcategoryId: 's1',
    })
  })

  it('update sends null on the payer not used (account → card and back)', () => {
    expect(toUpdatePayload({ ...ok, payer: 'card:k1' })).toMatchObject({
      accountId: null,
      creditCardId: 'k1',
      subcategoryId: null,
    })
    expect(toUpdatePayload({ ...ok, payer: 'account:a1' })).toMatchObject({
      accountId: 'a1',
      creditCardId: null,
    })
  })
})

describe('fromSubscription', () => {
  const base = {
    name: 'Spotify', amountCents: 500, frequency: 'weekly' as const,
    nextDate: '2026-03-15T00:00:00.000Z', categoryId: 'c1',
  }

  it.each([
    { ...base, accountId: 'a1' },
    { ...base, creditCardId: 'k1', subcategoryId: 's1' },
  ])('round-trips %#', (sub) => {
    const values = fromSubscription(sub)
    expect(values.nextDate).toBe('2026-03-15')
    expect(subscriptionSchema.safeParse(values).success).toBe(true)
    const payload = toUpdatePayload(values)
    expect(payload.accountId).toBe('accountId' in sub ? sub.accountId : null)
    expect(payload.creditCardId).toBe('creditCardId' in sub ? sub.creditCardId : null)
    expect(payload.subcategoryId).toBe('subcategoryId' in sub ? sub.subcategoryId : null)
    expect(payload.amountCents).toBe(500)
  })
})
