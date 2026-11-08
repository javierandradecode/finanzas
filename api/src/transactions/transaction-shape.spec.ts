import { BadRequestException } from '@nestjs/common';
import { assertValidShape, TxShape } from './transaction-shape';

const expense: TxShape = {
  type: 'expense',
  amountCents: 1000,
  accountId: 'A',
  categoryId: 'C',
};
const transfer: TxShape = {
  type: 'transfer',
  amountCents: 1000,
  accountId: 'A',
  toAccountId: 'B',
};

describe('assertValidShape', () => {
  it('accepts a valid income/expense and a valid transfer', () => {
    expect(() => assertValidShape(expense)).not.toThrow();
    expect(() =>
      assertValidShape({ ...expense, type: 'income' }),
    ).not.toThrow();
    expect(() => assertValidShape(transfer)).not.toThrow();
  });

  it.each([
    ['transfer without destination', { ...transfer, toAccountId: undefined }],
    ['transfer with null destination', { ...transfer, toAccountId: null }],
    ['transfer to the same account', { ...transfer, toAccountId: 'A' }],
    ['transfer with a category', { ...transfer, categoryId: 'C' }],
    ['transfer with a subcategory', { ...transfer, subcategoryId: 'S' }],
    ['expense without category', { ...expense, categoryId: undefined }],
    ['expense with a destination', { ...expense, toAccountId: 'B' }],
    [
      'subcategory without category',
      { ...expense, categoryId: null, subcategoryId: 'S' },
    ],
    ['amount 0', { ...expense, amountCents: 0 }],
    ['negative amount', { ...expense, amountCents: -5 }],
    ['fractional amount', { ...expense, amountCents: 10.5 }],
  ])('rejects %s', (_name, shape) => {
    expect(() => assertValidShape(shape)).toThrow(BadRequestException);
  });
});
