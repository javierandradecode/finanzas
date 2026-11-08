import { previewSchedule } from './installments'

const preview = (totalCents: number, installments: number, annualRatePercent = 0) =>
  previewSchedule({ totalCents, installments, annualRatePercent })

describe('previewSchedule (must match the API)', () => {
  it('splits 1200,00 into 12 equal installments without interest', () => {
    const p = preview(120000, 12)!
    expect(p.items).toHaveLength(12)
    for (const i of p.items) {
      expect(i.principalCents).toBe(10000)
      expect(i.interestCents).toBe(0)
      expect(i.paymentCents).toBe(10000)
    }
    expect(p.firstPaymentCents).toBe(10000)
    expect(p.totalInterestCents).toBe(0)
    expect(p.totalPaidCents).toBe(120000)
  })

  it('puts the leftover cents in the first installment', () => {
    expect(preview(100000, 3)!.items.map((i) => i.principalCents)).toEqual([
      33334, 33333, 33333,
    ])
    expect(preview(100000, 7)!.items.map((i) => i.principalCents)).toEqual([
      14290, 14285, 14285, 14285, 14285, 14285, 14285,
    ])
  })

  it('computes the fixed French payment for 1200,00 at 12 % over 12 months', () => {
    const p = preview(120000, 12, 12)!
    const first = p.items[0]
    expect(first.interestCents).toBe(1200)
    expect(first.paymentCents).toBe(10662)
    expect(first.principalCents).toBe(9462)
    expect(first.remainingPrincipalCents).toBe(110538)
    expect(p.items[11].remainingPrincipalCents).toBe(0)
    expect(p.firstPaymentCents).toBe(10662)
    expect(new Set(p.items.slice(0, 11).map((i) => i.paymentCents)).size).toBe(1)
  })

  it.each([
    [120000, 12, 12],
    [99999, 7, 18.5],
    [100, 3, 0],
    [1000001, 60, 24],
    [500, 2, 5],
  ])('principal sums to the total and ends at zero (%i, %i, %f %%)', (total, n, rate) => {
    const p = preview(total, n, rate)!
    expect(p.items.reduce((s, i) => s + i.principalCents, 0)).toBe(total)
    expect(p.items.at(-1)!.remainingPrincipalCents).toBe(0)
    expect(p.totalPaidCents).toBe(total + p.totalInterestCents)
    for (const i of p.items) {
      expect(i.paymentCents).toBe(i.principalCents + i.interestCents)
      expect(i.principalCents).toBeGreaterThanOrEqual(1)
    }
  })

  it.each([
    [0, 3, 0],
    [-5, 3, 0],
    [100.5, 3, 0],
    [100, 0, 0],
    [100, 1.5, 0],
    [1, 2, 0], // less than one cent per installment
    [100, 60, 100], // too small to amortise at that rate
    [100, 3, -1],
    [Number.NaN, 3, 0],
  ])('returns null for invalid input (%f, %f, %f %%)', (total, n, rate) => {
    expect(preview(total, n, rate)).toBeNull()
  })
})
