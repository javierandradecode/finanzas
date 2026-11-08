import { accountSchema } from './account-schema'

const ok = { name: 'Caja', type: 'cash', initialBalanceCents: 100 }

describe('accountSchema', () => {
  it('accepts valid input, including an empty or negative balance', () => {
    expect(accountSchema.safeParse(ok).success).toBe(true)
    expect(
      accountSchema.safeParse({ ...ok, initialBalanceCents: null }).success,
    ).toBe(true)
    expect(
      accountSchema.safeParse({ ...ok, initialBalanceCents: -500 }).success,
    ).toBe(true)
  })

  it('rejects an empty or whitespace name', () => {
    for (const name of ['', '   ']) {
      const r = accountSchema.safeParse({ ...ok, name })
      expect(r.error!.issues[0].message).toBe('Ingresa un nombre')
    }
  })

  it('rejects an unknown type', () => {
    expect(accountSchema.safeParse({ ...ok, type: 'bitcoin' }).success).toBe(
      false,
    )
  })

  it('rejects a NaN balance (text that is not an amount)', () => {
    const r = accountSchema.safeParse({ ...ok, initialBalanceCents: Number.NaN })
    expect(r.success).toBe(false)
    expect(r.error!.issues[0].message).toBe('Monto no válido')
  })
})
