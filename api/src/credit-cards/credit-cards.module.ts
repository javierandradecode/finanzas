import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InstallmentPurchase,
  InstallmentPurchaseSchema,
} from '../installment-purchases/schemas/installment-purchase.schema';
import {
  Transaction,
  TransactionSchema,
} from '../transactions/schemas/transaction.schema';
import { CreditCardsController } from './credit-cards.controller';
import { CreditCardsService } from './credit-cards.service';
import { CreditCard, CreditCardSchema } from './schemas/credit-card.schema';
import { StatementService } from './statement.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreditCard.name, schema: CreditCardSchema },
      // Registered here (models only, no module import) so the statement can read them.
      { name: Transaction.name, schema: TransactionSchema },
      { name: InstallmentPurchase.name, schema: InstallmentPurchaseSchema },
    ]),
  ],
  controllers: [CreditCardsController],
  providers: [CreditCardsService, StatementService],
  exports: [CreditCardsService, StatementService],
})
export class CreditCardsModule {}
