import { BadRequestException } from '@nestjs/common';
import { assertValidShape, TxShape } from './transaction-shape';

const expense: TxShape = {
  type: 'expense',
  amountCents: 1000,
  accountId: 'A',
  categoryId: 'C',
};
const cardExpense: TxShape = {
  type: 'expense',
  amountCents: 1000,
  creditCardId: 'K',
  categoryId: 'C',
};
const transfer: TxShape = {
  type: 'transfer',
  amountCents: 1000,
  accountId: 'A',
  toAccountId: 'B',
};
const cardPayment: TxShape = {
  type: 'transfer',
  amountCents: 1000,
  accountId: 'A',
  toCreditCardId: 'K',
};

describe('assertValidShape', () => {
  it('accepts valid income, expenses, transfers and card payments', () => {
    expect(() => assertValidShape(expense)).not.toThrow();
    expect(() =>
      assertValidShape({ ...expense, type: 'income' }),
    ).not.toThrow();
    expect(() => assertValidShape(cardExpense)).not.toThrow();
    expect(() => assertValidShape(transfer)).not.toThrow();
    expect(() => assertValidShape(cardPayment)).not.toThrow();
  });

  it.each([
    ['transfer without destination', { ...transfer, toAccountId: undefined }],
    ['transfer with null destination', { ...transfer, toAccountId: null }],
    ['transfer to the same account', { ...transfer, toAccountId: 'A' }],
    ['transfer with a category', { ...transfer, categoryId: 'C' }],
    ['transfer with a subcategory', { ...transfer, subcategoryId: 'S' }],
    ['transfer with two destinations', { ...transfer, toCreditCardId: 'K' }],
    ['transfer from a card', { ...transfer, creditCardId: 'K' }],
    ['transfer without origin account', { ...transfer, accountId: undefined }],
    ['card payment with a category', { ...cardPayment, categoryId: 'C' }],
    ['expense without category', { ...expense, categoryId: undefined }],
    ['expense with a destination', { ...expense, toAccountId: 'B' }],
    ['expense with a card destination', { ...expense, toCreditCardId: 'K' }],
    ['expense with account and card', { ...expense, creditCardId: 'K' }],
    [
      'expense with neither account nor card',
      { ...expense, accountId: undefined },
    ],
    [
      'income with a card',
      { ...expense, type: 'income', accountId: null, creditCardId: 'K' },
    ],
    ['income without account', { ...expense, type: 'income', accountId: null }],
    [
      'subcategory without category',
      { ...expense, categoryId: null, subcategoryId: 'S' },
    ],
    ['amount 0', { ...expense, amountCents: 0 }],
    ['negative amount', { ...expense, amountCents: -5 }],
    ['fractional amount', { ...expense, amountCents: 10.5 }],
  ])('rejects %s', (_name, shape) => {
    expect(() => assertValidShape(shape as TxShape)).toThrow(
      BadRequestException,
    );
  });
});
