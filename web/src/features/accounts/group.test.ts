import type { Account } from '@/api/accounts'
import { groupAccounts } from './group'

const acc = (
  id: string,
  type: Account['type'],
  balanceCents: number,
  isArchived = false,
): Account => ({ _id: id, type, name: id, balanceCents, isArchived })

describe('groupAccounts', () => {
  it('groups by type in a fixed order and omits empty groups', () => {
    const { groups } = groupAccounts([
      acc('c', 'cash', 100),
      acc('s', 'savings', 200),
      acc('k1', 'checking', 300),
      acc('k2', 'checking', 400),
    ])
    expect(groups.map((g) => g.type)).toEqual(['checking', 'savings', 'cash'])
    expect(groups[0].accounts.map((a) => a._id)).toEqual(['k1', 'k2'])
    expect(groupAccounts([acc('c', 'cash', 1)]).groups.map((g) => g.type)).toEqual(['cash'])
  })

  it('sums subtotals and total over active accounts only, but lists archived ones', () => {
    const { total, groups } = groupAccounts([
      acc('a', 'savings', 1000),
      acc('b', 'savings', 500, true),
      acc('c', 'cash', -200),
    ])
    expect(total).toBe(800)
    expect(groups.find((g) => g.type === 'savings')).toMatchObject({ subtotal: 1000 })
    expect(groups.find((g) => g.type === 'savings')?.accounts).toHaveLength(2)
  })

  it('computes whole-number shares from positive subtotals, ignoring negatives', () => {
    const { shares } = groupAccounts([
      acc('a', 'savings', 7500),
      acc('b', 'checking', 2500),
      acc('c', 'cash', -900),
    ])
    expect(shares).toEqual([
      { type: 'checking', percent: 25 },
      { type: 'savings', percent: 75 },
    ])
  })

  it('has no shares when nothing is positive (no division by zero)', () => {
    expect(groupAccounts([acc('a', 'cash', -100)]).shares).toEqual([])
    expect(groupAccounts([acc('a', 'cash', 100, true)]).shares).toEqual([])
    expect(groupAccounts([])).toEqual({ total: 0, groups: [], shares: [] })
  })
})
