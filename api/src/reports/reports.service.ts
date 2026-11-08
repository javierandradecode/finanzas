import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category } from '../categories/schemas/category.schema';
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
}
