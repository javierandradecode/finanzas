import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { InstallmentPurchasesModule } from '../installment-purchases/installment-purchases.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import {
  Transaction,
  TransactionSchema,
} from '../transactions/schemas/transaction.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
    AccountsModule,
    BudgetsModule,
    CategoriesModule,
    CreditCardsModule,
    InstallmentPurchasesModule,
    SubscriptionsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
