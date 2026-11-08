import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { BudgetsService } from '../budgets/budgets.service';
import { CategoriesService } from '../categories/categories.service';
import { Category } from '../categories/schemas/category.schema';
import { CreditCardsService } from '../credit-cards/credit-cards.service';
import {
  InstallmentPurchasesService,
  MonthlyProjection,
} from '../installment-purchases/installment-purchases.service';
import {
  SubscriptionsService,
  UpcomingCharge,
} from '../subscriptions/subscriptions.service';
import { Transaction } from '../transactions/schemas/transaction.schema';
import {
  isMonthKey,
  lastMonths,
  monthKeyOf,
  monthRange,
  monthsBetween,
} from './months';

/** Longest span `income-vs-expenses` accepts. */
export const MAX_REPORT_MONTHS = 60;

const TOP_CATEGORIES = 5;
const SUMMARY_SUBSCRIPTION_DAYS = 14;
const SUMMARY_PROJECTION_MONTHS = 3;

const oid = (id: string) => new Types.ObjectId(id);

export interface SpendingByCategory {
  from: Date;
  to: Date;
  totalCents: number;
  items: Array<{
    categoryId: string;
    name: string;
    icon: string;
    color: string;
    totalCents: number;
    count: number;
  }>;
}

export interface IncomeVsExpenses {
  from: string;
  to: string;
  months: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }>;
}

export interface BudgetVsSpent {
  month: string;
  items: Array<{
    budgetId: string;
    categoryId: string;
    name: string;
    icon: string;
    color: string;
    limitCents: number;
    spentCents: number;
    /** Negative when the budget is exceeded. */
    remainingCents: number;
    /** Percentage with one decimal (the only non-integer figure; it is not money). */
    percentUsed: number;
    overBudget: boolean;
  }>;
  totals: { limitCents: number; spentCents: number; overBudgetCount: number };
}

export interface CardDebtReport {
  totalDebtCents: number;
  totalLimitCents: number;
  totalAvailableCents: number;
  cards: Array<{
    cardId: string;
    name: string;
    debtCents: number;
    limitCents: number;
    availableCents: number;
  }>;
  projectedPayments: MonthlyProjection[];
}

export interface DashboardSummary {
  month: string;
  totalBalanceCents: number;
  cardDebtCents: number;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  topCategories: SpendingByCategory['items'];
  budgets: BudgetVsSpent['totals'];
  upcomingSubscriptions: UpcomingCharge[];
  installmentProjection: MonthlyProjection[];
}

/**
 * Reports computed inside MongoDB with aggregation pipelines.
 *
 * "Spending" is every transaction of type `expense` (paid from an account or a
 * credit card). Transfers, including card payments, only move money and never
 * count as spending or income.
 *
 * Note: pipeline stages do NOT cast ids, so `userId` is always converted to an
 * ObjectId by hand before it reaches a `$match`.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Transaction.name) private readonly txModel: Model<Transaction>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    private readonly budgets: BudgetsService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly cards: CreditCardsService,
    private readonly installments: InstallmentPurchasesService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Spending per category between `from` and `to` (both included); defaults to the current month. */
  async spendingByCategory(
    userId: string,
    range: { from?: Date; to?: Date } = {},
    now: Date = new Date(),
  ): Promise<SpendingByCategory> {
    const thisMonth = monthRange(monthKeyOf(now));
    const from = range.from ?? thisMonth.start;
    const to = range.to ?? new Date(thisMonth.endExclusive.getTime() - 1);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" must not be after "to"');
    }

    const rows = await this.txModel.aggregate<{
      _id: Types.ObjectId | null;
      totalCents: number;
      count: number;
      category?: Category;
    }>([
      {
        $match: {
          userId: oid(userId),
          type: 'expense',
          date: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$categoryId',
          totalCents: { $sum: '$amountCents' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: this.categoryModel.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      { $sort: { totalCents: -1, _id: 1 } },
    ]);

    const items = rows.map((row) => ({
      categoryId: row._id ? String(row._id) : '',
      name: row.category?.name ?? 'Sin categoría',
      icon: row.category?.icon ?? '',
      color: row.category?.color ?? '',
      totalCents: row.totalCents,
      count: row.count,
    }));
    return {
      from,
      to,
      totalCents: items.reduce((sum, item) => sum + item.totalCents, 0),
      items,
    };
  }

  /**
   * Income and expenses for each month from `from` to `to` ("YYYY-MM"); the
   * default is the last 12 months. Months without movements show zeros.
   */
  async incomeVsExpenses(
    userId: string,
    range: { from?: string; to?: string } = {},
    now: Date = new Date(),
  ): Promise<IncomeVsExpenses> {
    const to = range.to ?? monthKeyOf(now);
    if (
      !isMonthKey(to) ||
      (range.from !== undefined && !isMonthKey(range.from))
    ) {
      throw new BadRequestException('Months must look like 2026-03');
    }
    const from = range.from ?? lastMonths(12, monthRange(to).start)[0];
    if (from > to) {
      throw new BadRequestException('"from" must not be after "to"');
    }
    const months = monthsBetween(from, to);
    if (months.length > MAX_REPORT_MONTHS) {
      throw new BadRequestException(
        `The range cannot exceed ${MAX_REPORT_MONTHS} months`,
      );
    }

    const rows = await this.txModel.aggregate<{
      _id: { month: string; type: 'income' | 'expense' };
      total: number;
    }>([
      {
        $match: {
          userId: oid(userId),
          type: { $in: ['income', 'expense'] },
          date: {
            $gte: monthRange(from).start,
            $lt: monthRange(to).endExclusive,
          },
        },
      },
      {
        $group: {
          _id: {
            month: {
              $dateToString: {
                format: '%Y-%m',
                date: '$date',
                timezone: 'UTC',
              },
            },
            type: '$type',
          },
          total: { $sum: '$amountCents' },
        },
      },
    ]);

    const totals = new Map<string, { income: number; expense: number }>(
      months.map((month) => [month, { income: 0, expense: 0 }]),
    );
    for (const row of rows) {
      const bucket = totals.get(row._id.month);
      if (bucket) bucket[row._id.type] += row.total;
    }
    return {
      from,
      to,
      months: months.map((month) => {
        const { income, expense } = totals.get(month)!;
        return {
          month,
          incomeCents: income,
          expenseCents: expense,
          netCents: income - expense,
        };
      }),
    };
  }

  /** Each budget of `month` against what was spent in its category (subcategories included). */
  async budgetVsSpent(
    userId: string,
    month?: string,
    now: Date = new Date(),
  ): Promise<BudgetVsSpent> {
    const target = month ?? monthKeyOf(now);
    if (!isMonthKey(target)) {
      throw new BadRequestException('Month must look like 2026-03');
    }
    const { start, endExclusive } = monthRange(target);

    const [budgets, categories, spentRows] = await Promise.all([
      this.budgets.findAll(userId, target),
      this.categories.findAll(userId, { includeArchived: true }),
      this.txModel.aggregate<{ _id: Types.ObjectId; spentCents: number }>([
        {
          $match: {
            userId: oid(userId),
            type: 'expense',
            date: { $gte: start, $lt: endExclusive },
          },
        },
        {
          $group: {
            _id: '$categoryId',
            spentCents: { $sum: '$amountCents' },
          },
        },
      ]),
    ]);

    const spentByCategory = new Map(
      spentRows.map((row) => [String(row._id), row.spentCents]),
    );
    const categoryById = new Map(categories.map((c) => [String(c._id), c]));

    const items = budgets
      .map((budget) => {
        const categoryId = String(budget.categoryId);
        const category = categoryById.get(categoryId);
        const spentCents = spentByCategory.get(categoryId) ?? 0;
        return {
          budgetId: String(budget._id),
          categoryId,
          name: category?.name ?? 'Sin categoría',
          icon: category?.icon ?? '',
          color: category?.color ?? '',
          limitCents: budget.limitCents,
          spentCents,
          remainingCents: budget.limitCents - spentCents,
          percentUsed: Math.round((spentCents * 1000) / budget.limitCents) / 10,
          overBudget: spentCents > budget.limitCents,
        };
      })
      .sort(
        (a, b) => b.percentUsed - a.percentUsed || a.name.localeCompare(b.name),
      );

    return {
      month: target,
      items,
      totals: {
        limitCents: items.reduce((sum, i) => sum + i.limitCents, 0),
        spentCents: items.reduce((sum, i) => sum + i.spentCents, 0),
        overBudgetCount: items.filter((i) => i.overBudget).length,
      },
    };
  }

  /** Debt, limit and available credit of the active cards, plus the installments due each month. */
  async cardDebt(
    userId: string,
    months = 12,
    now: Date = new Date(),
  ): Promise<CardDebtReport> {
    const [cards, projectedPayments] = await Promise.all([
      this.cards.findAll(userId),
      this.installments.projection(userId, { months }, now),
    ]);
    const rows = cards.map((card) => ({
      cardId: String(card._id),
      name: card.name,
      debtCents: card.debtCents,
      limitCents: card.limitCents,
      availableCents: card.limitCents - card.debtCents,
    }));
    const sum = (pick: (row: (typeof rows)[number]) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);
    return {
      totalDebtCents: sum((r) => r.debtCents),
      totalLimitCents: sum((r) => r.limitCents),
      totalAvailableCents: sum((r) => r.availableCents),
      cards: rows,
      projectedPayments,
    };
  }

  /** Everything the dashboard's summary cards need in one call. */
  async summary(
    userId: string,
    month?: string,
    now: Date = new Date(),
  ): Promise<DashboardSummary> {
    const target = month ?? monthKeyOf(now);
    if (!isMonthKey(target)) {
      throw new BadRequestException('Month must look like 2026-03');
    }
    const { start, endExclusive } = monthRange(target);

    const [
      accounts,
      cardDebt,
      monthly,
      spending,
      budgets,
      upcomingSubscriptions,
    ] = await Promise.all([
      this.accounts.findAll(userId),
      this.cardDebt(userId, SUMMARY_PROJECTION_MONTHS, now),
      this.incomeVsExpenses(userId, { from: target, to: target }, now),
      this.spendingByCategory(
        userId,
        { from: start, to: new Date(endExclusive.getTime() - 1) },
        now,
      ),
      this.budgetVsSpent(userId, target, now),
      this.subscriptions.upcoming(userId, SUMMARY_SUBSCRIPTION_DAYS, now),
    ]);

    const { incomeCents, expenseCents, netCents } = monthly.months[0];
    return {
      month: target,
      totalBalanceCents: accounts.reduce((sum, a) => sum + a.balanceCents, 0),
      cardDebtCents: cardDebt.totalDebtCents,
      incomeCents,
      expenseCents,
      netCents,
      topCategories: spending.items.slice(0, TOP_CATEGORIES),
      budgets: budgets.totals,
      upcomingSubscriptions,
      installmentProjection: cardDebt.projectedPayments,
    };
  }
}
