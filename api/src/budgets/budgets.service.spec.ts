import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import {
  InMemoryMongo,
  mongoTestOptions,
  startMongo,
} from '../../test/mongo-memory';
import { CategoriesService } from '../categories/categories.service';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { BudgetsService } from './budgets.service';
import { CopyBudgetsDto } from './dto/copy-budgets.dto';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { Budget, BudgetSchema } from './schemas/budget.schema';

jest.setTimeout(180_000);

const oid = () => new Types.ObjectId();

describe('BudgetsService (integration)', () => {
  let mongo: InMemoryMongo;
  let moduleRef: TestingModule;
  let service: BudgetsService;
  let categoryModel: Model<Category>;
  let budgetModel: Model<Budget>;

  const u1 = oid();
  const u2 = oid();
  let food: string;
  let transport: string;
  let home: string;
  let income: string;
  let archived: string;
  let foreign: string;

  beforeAll(async () => {
    mongo = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.uri, mongoTestOptions),
        MongooseModule.forFeature([
          { name: Category.name, schema: CategorySchema },
          { name: Budget.name, schema: BudgetSchema },
        ]),
      ],
      providers: [CategoriesService, BudgetsService],
    }).compile();
    service = moduleRef.get(BudgetsService);
    categoryModel = moduleRef.get(getModelToken(Category.name));
    budgetModel = moduleRef.get(getModelToken(Budget.name));
    await budgetModel.init(); // builds the unique index
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      categoryModel.deleteMany({}),
      budgetModel.deleteMany({}),
    ]);
    const cat = (
      userId: Types.ObjectId,
      type: 'income' | 'expense',
      name: string,
      isArchived = false,
    ) =>
      categoryModel
        .create({ userId, type, name, icon: 'i', color: '#000000', isArchived })
        .then((d) => String(d._id));
    food = await cat(u1, 'expense', 'Alimentación');
    transport = await cat(u1, 'expense', 'Transporte');
    home = await cat(u1, 'expense', 'Hogar');
    income = await cat(u1, 'income', 'Salario');
    archived = await cat(u1, 'expense', 'Vieja', true);
    foreign = await cat(u2, 'expense', 'Ajena');
  });

  const dto = (over: Record<string, unknown> = {}) => ({
    categoryId: food,
    month: '2026-03',
    limitCents: 40_000,
    ...over,
  });

  const seed = (
    userId: Types.ObjectId,
    categoryId: string,
    month: string,
    limitCents: number,
  ) =>
    budgetModel.create({
      userId,
      categoryId: new Types.ObjectId(categoryId),
      month,
      limitCents,
    });

  describe('create', () => {
    it('stores the budget', async () => {
      const budget = await service.create(String(u1), dto());
      expect(budget).toMatchObject({ month: '2026-03', limitCents: 40_000 });
      expect(String(budget.categoryId)).toBe(food);
      expect(String(budget.userId)).toBe(String(u1));
    });

    it('rejects a second budget for the same category and month', async () => {
      await service.create(String(u1), dto());
      await expect(
        service.create(String(u1), dto({ limitCents: 1 })),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await budgetModel.countDocuments({})).toBe(1);
    });

    it('allows the same category in another month and another category in the same month', async () => {
      await service.create(String(u1), dto());
      await service.create(String(u1), dto({ month: '2026-04' }));
      await service.create(String(u1), dto({ categoryId: transport }));
      expect(await budgetModel.countDocuments({})).toBe(3);
    });

    it.each([
      [
        'an income category',
        () => ({ categoryId: income }),
        BadRequestException,
      ],
      [
        'an archived category',
        () => ({ categoryId: archived }),
        ConflictException,
      ],
      [
        'a foreign category',
        () => ({ categoryId: foreign }),
        NotFoundException,
      ],
    ])('rejects %s and stores nothing', async (_n, over, error) => {
      await expect(
        service.create(String(u1), dto(over())),
      ).rejects.toBeInstanceOf(error);
      expect(await budgetModel.countDocuments({})).toBe(0);
    });
  });

  describe('DTO validation', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });

    it.each([
      ['limitCents 0', { limitCents: 0 }],
      ['fractional limitCents', { limitCents: 10.5 }],
      ['month 2026-13', { month: '2026-13' }],
      ['month 2026-3', { month: '2026-3' }],
      ['malformed category id', { categoryId: 'abc' }],
    ])('CreateBudgetDto rejects %s', async (_n, over) => {
      await expect(
        pipe.transform(
          { categoryId: food, month: '2026-03', limitCents: 1000, ...over },
          { type: 'body', metatype: CreateBudgetDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('UpdateBudgetDto keeps only limitCents', async () => {
      const result = (await pipe.transform(
        { limitCents: 5000, categoryId: food, month: '2030-01' },
        { type: 'body', metatype: UpdateBudgetDto },
      )) as Record<string, unknown>;
      expect(result).toEqual({ limitCents: 5000 });
    });

    it('CopyBudgetsDto rejects malformed months', async () => {
      await expect(
        pipe.transform(
          { from: '2026-3', to: '2026-04' },
          { type: 'body', metatype: CopyBudgetsDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll / update / remove', () => {
    it('lists only the budgets of the user and month asked', async () => {
      await seed(u1, food, '2026-03', 1000);
      await seed(u1, transport, '2026-03', 2000);
      await seed(u1, food, '2026-04', 3000);
      await seed(u2, foreign, '2026-03', 4000);
      const march = await service.findAll(String(u1), '2026-03');
      expect(march.map((b) => b.limitCents).sort()).toEqual([1000, 2000]);
      expect(await service.findAll(String(u2), '2026-04')).toEqual([]);
    });

    it('update changes only the limit', async () => {
      const budget = await seed(u1, food, '2026-03', 1000);
      const updated = await service.update(String(u1), String(budget._id), {
        limitCents: 9000,
      });
      expect(updated.limitCents).toBe(9000);
      expect(updated.month).toBe('2026-03');
    });

    it("another user's budget is 404 for update and remove", async () => {
      const budget = await seed(u1, food, '2026-03', 1000);
      await expect(
        service.update(String(u2), String(budget._id), { limitCents: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.remove(String(u2), String(budget._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await budgetModel.countDocuments({})).toBe(1);
    });

    it('remove deletes the budget for real', async () => {
      const budget = await seed(u1, food, '2026-03', 1000);
      await service.remove(String(u1), String(budget._id));
      expect(await budgetModel.countDocuments({})).toBe(0);
    });
  });

  describe('copy', () => {
    it('copies what is missing, skipping existing and archived categories', async () => {
      await seed(u1, food, '2026-03', 40_000);
      await seed(u1, transport, '2026-03', 10_000);
      await seed(u1, archived, '2026-03', 5_000);
      await seed(u1, transport, '2026-04', 99_999); // already budgeted in April

      const result = await service.copy(String(u1), '2026-03', '2026-04');

      expect(result.copied).toBe(1);
      expect(result.skipped).toEqual(
        expect.arrayContaining([
          { categoryId: transport, reason: 'already-exists' },
          { categoryId: archived, reason: 'category-archived' },
        ]),
      );
      expect(result.skipped).toHaveLength(2);
      const april = await budgetModel
        .find({ userId: u1, month: '2026-04' })
        .lean();
      expect(april).toHaveLength(2);
      expect(april.find((b) => String(b.categoryId) === food)!.limitCents).toBe(
        40_000,
      );
      expect(
        april.find((b) => String(b.categoryId) === transport)!.limitCents,
      ).toBe(99_999);
    });

    it('copying an empty month copies nothing', async () => {
      expect(await service.copy(String(u1), '2026-01', '2026-02')).toEqual({
        copied: 0,
        skipped: [],
      });
    });

    it('rejects the same month and malformed months', async () => {
      await expect(
        service.copy(String(u1), '2026-03', '2026-03'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.copy(String(u1), '2026-3', '2026-04'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("never copies another user's budgets", async () => {
      await seed(u2, foreign, '2026-03', 7_000);
      expect(await service.copy(String(u1), '2026-03', '2026-04')).toEqual({
        copied: 0,
        skipped: [],
      });
      expect(await budgetModel.countDocuments({ month: '2026-04' })).toBe(0);
    });

    it('two simultaneous copies leave exactly one budget per category', async () => {
      await seed(u1, food, '2026-03', 40_000);
      await seed(u1, transport, '2026-03', 10_000);
      await seed(u1, home, '2026-03', 20_000);
      const [a, b] = await Promise.all([
        service.copy(String(u1), '2026-03', '2026-04'),
        service.copy(String(u1), '2026-03', '2026-04'),
      ]);
      expect(a.copied + b.copied).toBe(3);
      expect(
        await budgetModel.countDocuments({ userId: u1, month: '2026-04' }),
      ).toBe(3);
    });
  });
});
