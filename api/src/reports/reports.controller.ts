import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { endOfRange } from '../common/utils/date-range';
import {
  CardDebtQuery,
  MonthQuery,
  MonthRangeQuery,
  SpendingQuery,
} from './dto/reports.queries';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('spending-by-category')
  spendingByCategory(
    @CurrentUser() user: AuthUser,
    @Query() query: SpendingQuery,
  ) {
    return this.reports.spendingByCategory(user.userId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? endOfRange(query.to) : undefined,
    });
  }

  @Get('income-vs-expenses')
  incomeVsExpenses(
    @CurrentUser() user: AuthUser,
    @Query() query: MonthRangeQuery,
  ) {
    return this.reports.incomeVsExpenses(user.userId, query);
  }

  @Get('budget-vs-spent')
  budgetVsSpent(@CurrentUser() user: AuthUser, @Query() query: MonthQuery) {
    return this.reports.budgetVsSpent(user.userId, query.month);
  }

  @Get('card-debt')
  cardDebt(@CurrentUser() user: AuthUser, @Query() query: CardDebtQuery) {
    return this.reports.cardDebt(user.userId, query.months);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: MonthQuery) {
    return this.reports.summary(user.userId, query.month);
  }
}
