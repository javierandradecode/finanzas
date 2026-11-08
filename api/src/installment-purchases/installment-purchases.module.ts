import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import {
  Transaction,
  TransactionSchema,
} from '../transactions/schemas/transaction.schema';
import { TransactionsModule } from '../transactions/transactions.module';
import { InstallmentPurchasesService } from './installment-purchases.service';
import {
  InstallmentPurchase,
  InstallmentPurchaseSchema,
} from './schemas/installment-purchase.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InstallmentPurchase.name, schema: InstallmentPurchaseSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    CategoriesModule,
    CreditCardsModule,
    TransactionsModule,
  ],
  providers: [InstallmentPurchasesService],
  exports: [InstallmentPurchasesService],
})
export class InstallmentPurchasesModule {}
