import { BadRequestException } from '@nestjs/common';
import { TxFinancials } from './transaction-effects';

export interface TxShape extends TxFinancials {
  categoryId?: string | null;
  subcategoryId?: string | null;
}

/** Throws BadRequestException when the combination of fields makes no sense. */
export function assertValidShape(tx: TxShape): void {
  if (!Number.isInteger(tx.amountCents) || tx.amountCents < 1) {
    throw new BadRequestException('amountCents must be an integer >= 1');
  }
  if (tx.subcategoryId && !tx.categoryId) {
    throw new BadRequestException('subcategoryId requires categoryId');
  }

  switch (tx.type) {
    case 'income':
      if (!tx.accountId) {
        throw new BadRequestException('An income requires accountId');
      }
      if (tx.creditCardId || tx.toAccountId || tx.toCreditCardId) {
        throw new BadRequestException(
          'An income can only go to an account (no card or destination)',
        );
      }
      requireCategory(tx);
      return;

    case 'expense':
      if (Boolean(tx.accountId) === Boolean(tx.creditCardId)) {
        throw new BadRequestException(
          'An expense needs exactly one of accountId or creditCardId',
        );
      }
      if (tx.toAccountId || tx.toCreditCardId) {
        throw new BadRequestException('Only transfers can have a destination');
      }
      requireCategory(tx);
      return;

    case 'transfer':
      if (!tx.accountId) {
        throw new BadRequestException('A transfer requires accountId (origin)');
      }
      if (tx.creditCardId) {
        throw new BadRequestException('A transfer cannot start from a card');
      }
      if (Boolean(tx.toAccountId) === Boolean(tx.toCreditCardId)) {
        throw new BadRequestException(
          'A transfer needs exactly one of toAccountId or toCreditCardId',
        );
      }
      if (tx.toAccountId === tx.accountId) {
        throw new BadRequestException('Cannot transfer to the same account');
      }
      if (tx.categoryId || tx.subcategoryId) {
        throw new BadRequestException('A transfer cannot have a category');
      }
      return;
  }
}

function requireCategory(tx: TxShape): void {
  if (!tx.categoryId) {
    throw new BadRequestException('categoryId is required');
  }
}
