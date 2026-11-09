import type { Account, AccountType } from '@/api/accounts'

const ORDER: AccountType[] = ['checking', 'savings', 'cash']

/**
 * Groups accounts by type for the accounts page. Archived accounts are listed
 * but never count in totals, subtotals or shares. Shares only use positive
 * subtotals: a debt has no meaningful slice of a bar.
 */
export function groupAccounts(accounts: Account[]) {
  const groups = ORDER.map((type) => {
    const list = accounts.filter((a) => a.type === type)
    const subtotal = list
      .filter((a) => !a.isArchived)
      .reduce((sum, a) => sum + a.balanceCents, 0)
    return { type, subtotal, accounts: list }
  }).filter((g) => g.accounts.length > 0)

  const total = groups.reduce((sum, g) => sum + g.subtotal, 0)
  const positive = groups.filter((g) => g.subtotal > 0)
  const positiveSum = positive.reduce((sum, g) => sum + g.subtotal, 0)
  const shares = positive.map((g) => ({
    type: g.type,
    percent: Math.round((g.subtotal / positiveSum) * 100),
  }))

  return { total, groups, shares }
}
