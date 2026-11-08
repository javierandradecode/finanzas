import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CategoriesService } from '../categories/categories.service';
import { isMonthKey } from '../reports/months';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { Budget, BudgetDocument } from './schemas/budget.schema';

const MONGO_DUPLICATE_KEY = 11000;
const oid = (id: string) => new Types.ObjectId(id);
const isDuplicateKey = (error: unknown) =>
  (error as { code?: number }).code === MONGO_DUPLICATE_KEY;

export interface CopyResult {
  copied: number;
  skipped: Array<{
    categoryId: string;
    reason: 'already-exists' | 'category-archived';
  }>;
}

@Injectable()
export class BudgetsService {
  constructor(
    @InjectModel(Budget.name) private readonly model: Model<Budget>,
    private readonly categories: CategoriesService,
  ) {}

  findAll(userId: string, month: string): Promise<BudgetDocument[]> {
    return this.model
      .find({ userId: oid(userId), month })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
  }

  async create(userId: string, dto: CreateBudgetDto): Promise<BudgetDocument> {
    const category = await this.categories.findOne(userId, dto.categoryId);
    if (category.type !== 'expense') {
      throw new BadRequestException('A budget needs an expense category');
    }
    if (category.isArchived) {
      throw new ConflictException('Category is archived');
    }
    return this.insert(userId, dto.categoryId, dto.month, dto.limitCents);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateBudgetDto,
  ): Promise<BudgetDocument> {
    const doc = await this.model
      .findOne({ _id: oid(id), userId: oid(userId) })
      .exec();
    if (!doc) throw new NotFoundException('Budget not found');
    doc.limitCents = dto.limitCents;
    await doc.save();
    return doc;
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.model
      .deleteOne({ _id: oid(id), userId: oid(userId) })
      .exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Budget not found');
    }
  }

  /**
   * Copies the budgets of `from` into `to`. Categories that already have a
   * budget in `to` keep it, and archived categories are skipped. Safe to run
   * twice at once: the unique index turns the loser's inserts into "skipped".
   */
  async copy(userId: string, from: string, to: string): Promise<CopyResult> {
    if (!isMonthKey(from) || !isMonthKey(to)) {
      throw new BadRequestException('Months must look like 2026-03');
    }
    if (from === to) {
      throw new BadRequestException('"from" and "to" must be different months');
    }

    const [sources, categories] = await Promise.all([
      this.findAll(userId, from),
      this.categories.findAll(userId, { includeArchived: true }),
    ]);
    const archived = new Set(
      categories.filter((c) => c.isArchived).map((c) => String(c._id)),
    );

    const result: CopyResult = { copied: 0, skipped: [] };
    for (const source of sources) {
      const categoryId = String(source.categoryId);
      if (archived.has(categoryId)) {
        result.skipped.push({ categoryId, reason: 'category-archived' });
        continue;
      }
      try {
        await this.insert(userId, categoryId, to, source.limitCents);
        result.copied += 1;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        result.skipped.push({ categoryId, reason: 'already-exists' });
      }
    }
    return result;
  }

  private async insert(
    userId: string,
    categoryId: string,
    month: string,
    limitCents: number,
  ): Promise<BudgetDocument> {
    try {
      return await this.model.create({
        userId: oid(userId),
        categoryId: oid(categoryId),
        month,
        limitCents,
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException(
          'A budget for this category and month already exists',
        );
      }
      throw error;
    }
  }
}
