import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { validateEnv } from './config/env.validation';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { BudgetsModule } from './budgets/budgets.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { InstallmentPurchasesModule } from './installment-purchases/installment-purchases.module';
import { ReportsModule } from './reports/reports.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TransactionsModule } from './transactions/transactions.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    HealthModule,
    UsersModule,
    CategoriesModule,
    AccountsModule,
    TransactionsModule,
    CreditCardsModule,
    InstallmentPurchasesModule,
    SubscriptionsModule,
    BudgetsModule,
    ReportsModule,
    AuthModule,
  ],
})
export class AppModule {}
