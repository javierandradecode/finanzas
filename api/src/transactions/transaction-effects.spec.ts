import { effectsOf, netEffects, TxFinancials } from './transaction-effects';

const obj = (m: Map<string, number>) => Object.fromEntries(m);
const tx = (over: Partial<TxFinancials>): TxFinancials => ({
  type: 'expense',
  amountCents: 3000,
  accountId: 'A',
  ...over,
});

describe('effectsOf', () => {
  it('income adds to the account', () => {
    expect(obj(effectsOf(tx({ type: 'income', amountCents: 5000 })))).toEqual({
      A: 5000,
    });
  });

  it('expense subtracts from the account', () => {
    expect(obj(effectsOf(tx({})))).toEqual({ A: -3000 });
  });

  it('transfer moves money from origin to destination', () => {
    const t = tx({ type: 'transfer', amountCents: 2000, toAccountId: 'B' });
    expect(obj(effectsOf(t))).toEqual({ A: -2000, B: 2000 });
  });
});

describe('netEffects', () => {
  it('creation is the effect of the new state', () => {
    expect(obj(netEffects(null, tx({})))).toEqual({ A: -3000 });
  });

  it('deletion is the reverse of the old state', () => {
    expect(obj(netEffects(tx({}), null))).toEqual({ A: 3000 });
  });

  it('changing only the amount adjusts by the difference', () => {
    expect(obj(netEffects(tx({}), tx({ amountCents: 5000 })))).toEqual({
      A: -2000,
    });
  });

  it('no financial change yields no deltas', () => {
    expect(netEffects(tx({}), tx({})).size).toBe(0);
  });

  it('expense -> income with the same amount swings twice the amount', () => {
    expect(obj(netEffects(tx({}), tx({ type: 'income' })))).toEqual({
      A: 6000,
    });
  });

  it('moving an expense to another account reverses the old and applies the new', () => {
    expect(obj(netEffects(tx({}), tx({ accountId: 'B' })))).toEqual({
      A: 3000,
      B: -3000,
    });
  });

  it('changing a transfer destination moves the credit only', () => {
    const before = tx({
      type: 'transfer',
      amountCents: 2000,
      toAccountId: 'B',
    });
    const after = tx({ type: 'transfer', amountCents: 2000, toAccountId: 'C' });
    expect(obj(netEffects(before, after))).toEqual({ B: -2000, C: 2000 });
  });
});
