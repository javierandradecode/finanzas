import {
  chartAmount,
  lastMonthsRange,
  percentOf,
  topWithOthers,
  type CategorySpend,
} from './dashboard-data'

const cat = (i: number, totalCents: number): CategorySpend => ({
  categoryId: `c${i}`, name: `Cat ${i}`, icon: 'tag', color: '#112233', totalCents, count: i,
})
// already sorted from the biggest, as the API returns them
const seven = [cat(1, 700), cat(2, 600), cat(3, 500), cat(4, 400), cat(5, 300), cat(6, 200), cat(7, 100)]

describe('topWithOthers', () => {
  it('keeps the top five and groups the rest as "Otras"', () => {
    const out = topWithOthers(seven)
    expect(out).toHaveLength(6)
    expect(out.slice(0, 5)).toEqual(seven.slice(0, 5))
    expect(out[5]).toMatchObject({ categoryId: 'others', name: 'Otras', totalCents: 300, count: 13 })
    // nothing gets lost
    expect(out.reduce((s, i) => s + i.totalCents, 0)).toBe(seven.reduce((s, i) => s + i.totalCents, 0))
  })

  it('adds no "Otras" with exactly five or fewer', () => {
    expect(topWithOthers(seven.slice(0, 5))).toEqual(seven.slice(0, 5))
    expect(topWithOthers(seven.slice(0, 2))).toEqual(seven.slice(0, 2))
    expect(topWithOthers([])).toEqual([])
  })

  it('accepts another size', () => {
    const out = topWithOthers(seven, 2)
    expect(out.map((i) => i.name)).toEqual(['Cat 1', 'Cat 2', 'Otras'])
    expect(out[2].totalCents).toBe(1500)
  })

  it('does not mutate its input', () => {
    const copy = [...seven]
    topWithOthers(seven)
    expect(seven).toEqual(copy)
  })
})

describe('percentOf', () => {
  it('rounds to one decimal and never divides by zero', () => {
    expect(percentOf(25, 100)).toBe(25)
    expect(percentOf(1, 3)).toBe(33.3)
    expect(percentOf(2, 3)).toBe(66.7)
    expect(percentOf(5, 0)).toBe(0)
    expect(percentOf(0, 0)).toBe(0)
  })
})

describe('chartAmount', () => {
  it('turns cents into units for drawing only', () => {
    expect(chartAmount(12345)).toBe(123.45)
    expect(chartAmount(0)).toBe(0)
    expect(chartAmount(-500)).toBe(-5)
  })
})

describe('lastMonthsRange', () => {
  it('ends at the given month and spans six by default, across years', () => {
    expect(lastMonthsRange('2026-02')).toEqual({ from: '2025-09', to: '2026-02' })
    expect(lastMonthsRange('2026-11')).toEqual({ from: '2026-06', to: '2026-11' })
  })

  it('supports other counts', () => {
    expect(lastMonthsRange('2026-11', 1)).toEqual({ from: '2026-11', to: '2026-11' })
    expect(lastMonthsRange('2026-03', 12)).toEqual({ from: '2025-04', to: '2026-03' })
  })
})
