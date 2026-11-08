import { budgetSchema, budgetStatus, copyMessage } from './budget-form'

describe('budgetStatus', () => {
  it.each([
    [{ overBudget: false, percentUsed: 0 }, 'ok'],
    [{ overBudget: false, percentUsed: 79.9 }, 'ok'],
    [{ overBudget: false, percentUsed: 80 }, 'warn'],
    [{ overBudget: false, percentUsed: 100 }, 'warn'],
    [{ overBudget: true, percentUsed: 100.1 }, 'over'],
    [{ overBudget: true, percentUsed: 100 }, 'over'],
  ] as const)('%j → %s', (item, expected) => {
    expect(budgetStatus(item)).toBe(expected)
  })
})

describe('budgetSchema', () => {
  const ok = { categoryId: 'c1', limitCents: 40000 }
  const messages = (v: object) => {
    const r = budgetSchema.safeParse({ ...ok, ...v })
    return r.success ? [] : r.error.issues.map((i) => i.message)
  }

  it('accepts valid input', () => {
    expect(messages({})).toEqual([])
  })

  it('requires a category', () => {
    expect(messages({ categoryId: '' })).toContain('Elige una categoría')
  })

  it('validates the limit', () => {
    expect(messages({ limitCents: null })).toContain('Ingresa un monto')
    expect(messages({ limitCents: Number.NaN })).toContain('Monto no válido')
    expect(messages({ limitCents: 0 })).toContain('El límite debe ser mayor que 0')
    expect(messages({ limitCents: -5 })).toContain('El límite debe ser mayor que 0')
  })
})

describe('copyMessage', () => {
  const skip = (reason: 'already-exists' | 'category-archived', n = 1) =>
    Array.from({ length: n }, (_, i) => ({ categoryId: `${reason}-${i}`, reason }))

  it('singular success', () => {
    expect(copyMessage({ copied: 1, skipped: [] })).toEqual({
      kind: 'success',
      text: '1 presupuesto copiado',
    })
  })

  it('plural success with skipped ones explained', () => {
    expect(
      copyMessage({
        copied: 3,
        skipped: [...skip('already-exists', 2), ...skip('category-archived', 1)],
      }),
    ).toEqual({
      kind: 'success',
      text: '3 presupuestos copiados, 2 ya existían, 1 con categoría archivada',
    })
  })

  it('uses the singular for a single existing one', () => {
    expect(copyMessage({ copied: 2, skipped: skip('already-exists', 1) }).text).toBe(
      '2 presupuestos copiados, 1 ya existía',
    )
  })

  it('nothing copied because everything was skipped', () => {
    const r = copyMessage({ copied: 0, skipped: skip('already-exists', 2) })
    expect(r.kind).toBe('info')
    expect(r.text).toBe('No se copió nada: 2 ya existían')
  })

  it('nothing to copy at all', () => {
    expect(copyMessage({ copied: 0, skipped: [] })).toEqual({
      kind: 'info',
      text: 'No había presupuestos en el mes anterior',
    })
  })
})
