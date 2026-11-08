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
  if (tx.type === 'transfer') {
    if (!tx.toAccountId) {
      throw new BadRequestException('A transfer requires toAccountId');
    }
    if (tx.toAccountId === tx.accountId) {
      throw new BadRequestException('Cannot transfer to the same account');
    }
    if (tx.categoryId || tx.subcategoryId) {
      throw new BadRequestException('A transfer cannot have a category');
    }
    return;
  }
  if (!tx.categoryId) {
    throw new BadRequestException('categoryId is required');
  }
  if (tx.toAccountId) {
    throw new BadRequestException('Only transfers can have toAccountId');
  }
}
