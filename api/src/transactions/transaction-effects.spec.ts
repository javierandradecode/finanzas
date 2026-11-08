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
    const e = effectsOf(tx({ type: 'income', amountCents: 5000 }));
    expect(obj(e.accounts)).toEqual({ A: 5000 });
    expect(e.cards.size).toBe(0);
  });

  it('expense subtracts from the account', () => {
    const e = effectsOf(tx({}));
    expect(obj(e.accounts)).toEqual({ A: -3000 });
    expect(e.cards.size).toBe(0);
  });

  it('transfer moves money from origin to destination', () => {
    const t = tx({ type: 'transfer', amountCents: 2000, toAccountId: 'B' });
    const e = effectsOf(t);
    expect(obj(e.accounts)).toEqual({ A: -2000, B: 2000 });
    expect(e.cards.size).toBe(0);
  });

  it('a credit card expense raises the card debt and touches no account', () => {
    const e = effectsOf(tx({ accountId: null, creditCardId: 'K' }));
    expect(e.accounts.size).toBe(0);
    expect(obj(e.cards)).toEqual({ K: 3000 });
  });

  it('a transfer to a credit card lowers the account and the debt', () => {
    const e = effectsOf(
      tx({ type: 'transfer', amountCents: 2000, toCreditCardId: 'K' }),
    );
    expect(obj(e.accounts)).toEqual({ A: -2000 });
    expect(obj(e.cards)).toEqual({ K: -2000 });
  });
});

describe('netEffects', () => {
  it('creation is the effect of the new state', () => {
    expect(obj(netEffects(null, tx({})).accounts)).toEqual({ A: -3000 });
  });

  it('deletion is the reverse of the old state', () => {
    expect(obj(netEffects(tx({}), null).accounts)).toEqual({ A: 3000 });
  });

  it('changing only the amount adjusts by the difference', () => {
    expect(obj(netEffects(tx({}), tx({ amountCents: 5000 })).accounts)).toEqual(
      { A: -2000 },
    );
  });

  it('no financial change yields no deltas', () => {
    const e = netEffects(tx({}), tx({}));
    expect(e.accounts.size).toBe(0);
    expect(e.cards.size).toBe(0);
  });

  it('expense -> income with the same amount swings twice the amount', () => {
    expect(obj(netEffects(tx({}), tx({ type: 'income' })).accounts)).toEqual({
      A: 6000,
    });
  });

  it('moving an expense to another account reverses the old and applies the new', () => {
    expect(obj(netEffects(tx({}), tx({ accountId: 'B' })).accounts)).toEqual({
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
    expect(obj(netEffects(before, after).accounts)).toEqual({
      B: -2000,
      C: 2000,
    });
  });

  it('moving an expense from an account to a card swaps the effects', () => {
    const e = netEffects(tx({}), tx({ accountId: null, creditCardId: 'K' }));
    expect(obj(e.accounts)).toEqual({ A: 3000 });
    expect(obj(e.cards)).toEqual({ K: 3000 });
  });

  it('moving a card payment to another card moves the debt reduction', () => {
    const before = tx({
      type: 'transfer',
      amountCents: 2000,
      toCreditCardId: 'K',
    });
    const after = tx({
      type: 'transfer',
      amountCents: 2000,
      toCreditCardId: 'L',
    });
    const e = netEffects(before, after);
    expect(e.accounts.size).toBe(0);
    expect(obj(e.cards)).toEqual({ K: 2000, L: -2000 });
  });
});
