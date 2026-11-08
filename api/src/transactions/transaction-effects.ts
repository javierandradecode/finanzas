export type TxType = 'income' | 'expense' | 'transfer';

export interface TxFinancials {
  type: TxType;
  amountCents: number;
  /** Income: receiving account. Expense: paying account. Transfer: origin. */
  accountId?: string | null;
  /** Transfers: destination account. */
  toAccountId?: string | null;
  /** Expenses: paying credit card (instead of an account). */
  creditCardId?: string | null;
  /** Transfers: credit card being paid (instead of a destination account). */
  toCreditCardId?: string | null;
}

/** id -> change in cents (account balance, or credit card debt) */
export type AccountDeltas = Map<string, number>;

export interface Effects {
  /** Change to each account's balance. */
  accounts: AccountDeltas;
  /** Change to each credit card's debt (positive = owes more). */
  cards: AccountDeltas;
}

function add(deltas: AccountDeltas, id: string, cents: number): void {
  deltas.set(id, (deltas.get(id) ?? 0) + cents);
}

/** How a transaction changes account balances and card debts. */
export function effectsOf(tx: TxFinancials): Effects {
  const accounts: AccountDeltas = new Map();
  const cards: AccountDeltas = new Map();
  switch (tx.type) {
    case 'income':
      if (tx.accountId) add(accounts, tx.accountId, tx.amountCents);
      break;
    case 'expense':
      if (tx.creditCardId) add(cards, tx.creditCardId, tx.amountCents);
      else if (tx.accountId) add(accounts, tx.accountId, -tx.amountCents);
      break;
    case 'transfer':
      if (tx.accountId) add(accounts, tx.accountId, -tx.amountCents);
      if (tx.toAccountId) add(accounts, tx.toAccountId, tx.amountCents);
      if (tx.toCreditCardId) add(cards, tx.toCreditCardId, -tx.amountCents);
      break;
  }
  return { accounts, cards };
}

function dropZeros(deltas: AccountDeltas): void {
  for (const [id, cents] of deltas) {
    if (cents === 0) deltas.delete(id);
  }
}

/**
 * Change needed to go from `before` to `after` (null = did not exist / no
 * longer exists). Entries whose net change is zero are omitted.
 */
export function netEffects(
  before: TxFinancials | null,
  after: TxFinancials | null,
): Effects {
  const net: Effects = { accounts: new Map(), cards: new Map() };
  const apply = (tx: TxFinancials | null, sign: 1 | -1): void => {
    if (!tx) return;
    const effects = effectsOf(tx);
    for (const [id, cents] of effects.accounts)
      add(net.accounts, id, sign * cents);
    for (const [id, cents] of effects.cards) add(net.cards, id, sign * cents);
  };
  apply(after, 1);
  apply(before, -1);
  dropZeros(net.accounts);
  dropZeros(net.cards);
  return net;
}
