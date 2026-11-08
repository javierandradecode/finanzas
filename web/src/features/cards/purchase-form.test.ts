import {
  payInstallmentSchema,
  purchaseSchema,
  toPurchasePayload,
  type PurchaseFormValues,
} from './purchase-form'

const ok: PurchaseFormValues = {
  description: ' Laptop ',
  categoryId: 'c1',
  subcategoryId: '',
  totalCents: 120000,
  installments: '12',
  annualRatePercent: '',
  startDate: '2026-03-15',
}

const messages = (v: Partial<PurchaseFormValues>) => {
  const r = purchaseSchema.safeParse({ ...ok, ...v })
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('purchaseSchema', () => {
  it('accepts valid input', () => {
    expect(messages({})).toEqual([])
    expect(messages({ annualRatePercent: '12,5' })).toEqual([])
  })

  it('validates the description', () => {
    expect(messages({ description: '  ' })).toContain('Ingresa una descripción')
    expect(messages({ description: 'x'.repeat(201) })).toContain(
      'La descripción admite hasta 200 caracteres',
    )
    expect(messages({ description: 'x'.repeat(200) })).toEqual([])
  })

  it('requires a category', () => {
    expect(messages({ categoryId: '' })).toContain('Elige una categoría')
  })

  it('validates the total', () => {
    expect(messages({ totalCents: null })).toContain('Ingresa un monto')
    expect(messages({ totalCents: Number.NaN })).toContain('Monto no válido')
    expect(messages({ totalCents: 0 })).toContain('El monto debe ser mayor que 0')
  })

  it.each(['1', '61', 'a', '', '2.5'])('rejects %p installments', (n) => {
    expect(messages({ installments: n })).toContain('Entre 2 y 60 cuotas')
  })

  it.each(['2', '60'])('accepts %p installments', (n) => {
    expect(messages({ installments: n })).toEqual([])
  })

  it.each(['101', 'abc', '-1'])('rejects rate %p', (rate) => {
    expect(messages({ annualRatePercent: rate })).toContain('Tasa entre 0 y 100')
  })

  it('accepts a rate of 100', () => {
    expect(messages({ annualRatePercent: '100' })).toEqual([])
  })

  it('validates the date', () => {
    expect(messages({ startDate: '2026-02-31' })).toContain('Fecha no válida')
    expect(messages({ startDate: '' })).toContain('Fecha no válida')
  })
})

describe('toPurchasePayload', () => {
  it('builds the API body, omitting an empty subcategory', () => {
    expect(toPurchasePayload(ok, 'k1')).toEqual({
      creditCardId: 'k1',
      description: 'Laptop',
      categoryId: 'c1',
      totalCents: 120000,
      installments: 12,
      annualRatePercent: 0,
      startDate: '2026-03-15',
    })
  })

  it('includes the subcategory and the rate when given', () => {
    expect(
      toPurchasePayload({ ...ok, subcategoryId: 's1', annualRatePercent: '12,5' }, 'k1'),
    ).toMatchObject({ subcategoryId: 's1', annualRatePercent: 12.5 })
  })
})

describe('payInstallmentSchema', () => {
  it('needs an account and a real date', () => {
    expect(payInstallmentSchema.safeParse({ accountId: 'a1', date: '2026-03-15' }).success).toBe(true)
    const r = payInstallmentSchema.safeParse({ accountId: '', date: '2026-02-31' })
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message)
    expect(msgs).toContain('Elige una cuenta')
    expect(msgs).toContain('Fecha no válida')
  })
})
