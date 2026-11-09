import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { BudgetsModule } from './budgets/budgets.module';
import { CategoriesModule } from './categories/categories.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { HealthModule } from './health/health.module';
import { InstallmentPurchasesModule } from './installment-purchases/installment-purchases.module';
import { ReportsModule } from './reports/reports.module';
import { SecurityModule } from './security/security.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

/**
 * Every domain module of the API. `AppModule` and the end-to-end test harness
 * both use this list, so the tests always run the same module graph as
 * production (they only differ in how config and MongoDB are wired).
 */
export const FEATURE_MODULES = [
  SecurityModule,
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
];
