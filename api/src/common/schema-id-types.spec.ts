import { AccountSchema } from '../accounts/schemas/account.schema';
import { CategorySchema } from '../categories/schemas/category.schema';
import { CreditCardSchema } from '../credit-cards/schemas/credit-card.schema';
import { InstallmentPurchaseSchema } from '../installment-purchases/schemas/installment-purchase.schema';
import { SubscriptionSchema } from '../subscriptions/schemas/subscription.schema';
import { TransactionSchema } from '../transactions/schemas/transaction.schema';

/**
 * `@Prop({ type: Types.ObjectId })` silently yields a Mixed path (no casting,
 * string ids never match). The id fields must be real ObjectId paths.
 */
describe('id fields are ObjectId paths', () => {
  it.each([
    ['Account', AccountSchema, ['userId']],
    ['Category', CategorySchema, ['userId']],
    ['CreditCard', CreditCardSchema, ['userId']],
    [
      'InstallmentPurchase',
      InstallmentPurchaseSchema,
      [
        'userId',
        'creditCardId',
        'categoryId',
        'subcategoryId',
        'purchaseTransactionId',
      ],
    ],
    [
      'Transaction',
      TransactionSchema,
      [
        'userId',
        'accountId',
        'toAccountId',
        'categoryId',
        'subcategoryId',
        'creditCardId',
        'toCreditCardId',
        'installmentPurchaseId',
        'subscriptionId',
      ],
    ],
    [
      'Subscription',
      SubscriptionSchema,
      ['userId', 'accountId', 'creditCardId', 'categoryId', 'subcategoryId'],
    ],
  ] as const)('%s', (_name, schema, fields) => {
    for (const field of fields) {
      expect([field, schema.path(field).instance]).toEqual([field, 'ObjectId']);
    }
  });
});
