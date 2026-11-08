export type TxType = 'income' | 'expense' | 'transfer';

export interface TxFinancials {
  type: TxType;
  amountCents: number;
  accountId: string;
  toAccountId?: string | null;
}

/** accountId -> change in cents */
export type AccountDeltas = Map<string, number>;

function add(deltas: AccountDeltas, accountId: string, cents: number): void {
  deltas.set(accountId, (deltas.get(accountId) ?? 0) + cents);
}

/** How a transaction changes account balances. */
export function effectsOf(tx: TxFinancials): AccountDeltas {
  const deltas: AccountDeltas = new Map();
  switch (tx.type) {
    case 'income':
      add(deltas, tx.accountId, tx.amountCents);
      break;
    case 'expense':
      add(deltas, tx.accountId, -tx.amountCents);
      break;
    case 'transfer':
      add(deltas, tx.accountId, -tx.amountCents);
      if (tx.toAccountId) add(deltas, tx.toAccountId, tx.amountCents);
      break;
  }
  return deltas;
}

/**
 * Balance change needed to go from `before` to `after` (null = did not exist /
 * no longer exists). Accounts whose net change is zero are omitted.
 */
export function netEffects(
  before: TxFinancials | null,
  after: TxFinancials | null,
): AccountDeltas {
  const net: AccountDeltas = new Map();
  if (after) {
    for (const [id, cents] of effectsOf(after)) add(net, id, cents);
  }
  if (before) {
    for (const [id, cents] of effectsOf(before)) add(net, id, -cents);
  }
  for (const [id, cents] of net) {
    if (cents === 0) net.delete(id);
  }
  return net;
}
