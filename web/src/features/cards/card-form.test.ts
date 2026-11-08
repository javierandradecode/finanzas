import { cardSchema, toCardPayload, type CardFormValues } from './card-form'

const ok: CardFormValues = {
  name: ' Visa ',
  limitCents: 150000,
  cutoffDay: '5',
  paymentDay: '20',
  annualRatePercent: '18,5',
  initialDebtCents: null,
}

const messages = (v: Partial<CardFormValues>) => {
  const r = cardSchema.safeParse({ ...ok, ...v })
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('cardSchema', () => {
  it('accepts valid input', () => {
    expect(messages({})).toEqual([])
    expect(messages({ annualRatePercent: '' })).toEqual([])
    expect(messages({ initialDebtCents: 5000 })).toEqual([])
  })

  it('requires a name', () => {
    expect(messages({ name: '   ' })).toContain('Ingresa un nombre')
  })

  it('validates the limit', () => {
    expect(messages({ limitCents: null })).toContain('Ingresa un cupo')
    expect(messages({ limitCents: Number.NaN })).toContain('Monto no válido')
    expect(messages({ limitCents: 0 })).toContain('El cupo debe ser mayor que 0')
  })

  it.each(['0', '32', '-1', 'a', '1.5', ''])('rejects day %p', (day) => {
    expect(messages({ cutoffDay: day })).toContain('Elige un día entre 1 y 31')
    expect(messages({ paymentDay: day })).toContain('Elige un día entre 1 y 31')
  })

  it.each(['1', '31'])('accepts day %p', (day) => {
    expect(messages({ cutoffDay: day, paymentDay: day })).toEqual([])
  })

  it.each(['abc', '-3', '1,234'])('rejects rate %p', (rate) => {
    expect(messages({ annualRatePercent: rate })).toContain('Tasa no válida')
  })

  it('rejects an initial debt that is not an amount', () => {
    expect(messages({ initialDebtCents: Number.NaN })).toContain('Monto no válido')
  })
})

describe('toCardPayload', () => {
  it('create: numbers, trimmed name and optional initial debt', () => {
    expect(toCardPayload(ok, 'create')).toEqual({
      name: 'Visa',
      limitCents: 150000,
      cutoffDay: 5,
      paymentDay: 20,
      annualRatePercent: 18.5,
    })
    expect(toCardPayload({ ...ok, initialDebtCents: 7000 }, 'create')).toMatchObject({
      initialDebtCents: 7000,
    })
  })

  it('an empty rate means 0', () => {
    expect(toCardPayload({ ...ok, annualRatePercent: '' }, 'create').annualRatePercent).toBe(0)
  })

  it('update never sends the initial debt', () => {
    const body = toCardPayload({ ...ok, initialDebtCents: 7000 }, 'update')
    expect(body).not.toHaveProperty('initialDebtCents')
  })
})
