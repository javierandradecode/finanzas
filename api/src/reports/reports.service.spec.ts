import { BadRequestException } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import {
  InMemoryMongo,
  mongoTestOptions,
  startMongo,
} from '../../test/mongo-memory';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { endOfRange } from '../common/utils/date-range';
import {
  Transaction,
  TransactionSchema,
} from '../transactions/schemas/transaction.schema';
import { ReportsService } from './reports.service';

jest.setTimeout(180_000);

const oid = () => new Types.ObjectId();
const at = (iso: string) => new Date(iso);

describe('ReportsService (integration)', () => {
  let mongo: InMemoryMongo;
  let moduleRef: TestingModule;
  let service: ReportsService;
  let txModel: Model<Transaction>;
  let categoryModel: Model<Category>;

  const u1 = oid();
  const u2 = oid();
  const account = oid();
  const card = oid();
  let food: Types.ObjectId;
  let transport: Types.ObjectId;
  let salary: Types.ObjectId;
  let oldCat: Types.ObjectId;
  let foreignCat: Types.ObjectId;

  beforeAll(async () => {
    mongo = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.uri, mongoTestOptions),
        MongooseModule.forFeature([
          { name: Category.name, schema: CategorySchema },
          { name: Transaction.name, schema: TransactionSchema },
        ]),
      ],
      providers: [ReportsService],
    }).compile();
    service = moduleRef.get(ReportsService);
    txModel = moduleRef.get(getModelToken(Transaction.name));
    categoryModel = moduleRef.get(getModelToken(Category.name));
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([txModel.deleteMany({}), categoryModel.deleteMany({})]);
    const cat = (
      userId: Types.ObjectId,
      type: 'income' | 'expense',
      name: string,
      extra: Record<string, unknown> = {},
    ) =>
      categoryModel
        .create({
          userId,
          type,
          name,
          icon: `${name}-icon`,
          color: '#112233',
          ...extra,
        })
        .then((d) => d._id);
    food = await cat(u1, 'expense', 'Alimentación', {
      subcategories: [{ name: 'Super' }],
    });
    transport = await cat(u1, 'expense', 'Transporte');
    salary = await cat(u1, 'income', 'Salario');
    oldCat = await cat(u1, 'expense', 'Vieja', { isArchived: true });
    foreignCat = await cat(u2, 'expense', 'Ajena');
  });

  const expense = (
    amountCents: number,
    date: string,
    over: Record<string, unknown> = {},
  ) =>
    txModel.create({
      userId: u1,
      type: 'expense',
      amountCents,
      date: at(date),
      accountId: account,
      categoryId: food,
      ...over,
    });
  const income = (
    amountCents: number,
    date: string,
    over: Record<string, unknown> = {},
  ) =>
    txModel.create({
      userId: u1,
      type: 'income',
      amountCents,
      date: at(date),
      accountId: account,
      categoryId: salary,
      ...over,
    });

  describe('spendingByCategory', () => {
    const march = {
      from: at('2026-03-01T00:00:00.000Z'),
      to: endOfRange('2026-03-31'),
    };

    it('adds account and card expenses per category, biggest first, with names', async () => {
      await expense(3000, '2026-03-05T10:00:00Z');
      await expense(2000, '2026-03-20T10:00:00Z', {
        accountId: undefined,
        creditCardId: card,
        subcategoryId: oid(),
      });
      await expense(500, '2026-03-10T10:00:00Z', { categoryId: transport });

      const report = await service.spendingByCategory(String(u1), march);

      expect(report.totalCents).toBe(5500);
      expect(report.items).toEqual([
        {
          categoryId: String(food),
          name: 'Alimentación',
          icon: 'Alimentación-icon',
          color: '#112233',
          totalCents: 5000,
          count: 2,
        },
        {
          categoryId: String(transport),
          name: 'Transporte',
          icon: 'Transporte-icon',
          color: '#112233',
          totalCents: 500,
          count: 1,
        },
      ]);
    });

    it('does not count transfers, card payments, income or other users', async () => {
      await expense(1000, '2026-03-05T10:00:00Z');
      await txModel.create({
        userId: u1,
        type: 'transfer',
        amountCents: 9000,
        date: at('2026-03-06T10:00:00Z'),
        accountId: account,
        toAccountId: oid(),
      });
      await txModel.create({
        userId: u1,
        type: 'transfer',
        amountCents: 8000,
        date: at('2026-03-07T10:00:00Z'),
        accountId: account,
        toCreditCardId: card,
      });
      await income(70000, '2026-03-08T10:00:00Z');
      await txModel.create({
        userId: u2,
        type: 'expense',
        amountCents: 6000,
        date: at('2026-03-09T10:00:00Z'),
        accountId: oid(),
        categoryId: foreignCat,
      });

      const report = await service.spendingByCategory(String(u1), march);
      expect(report.totalCents).toBe(1000);
      expect(report.items).toHaveLength(1);
    });

    it('counts an installment purchase in full on its purchase date, plus interest expenses', async () => {
      await expense(120000, '2026-03-10T10:00:00Z', {
        accountId: undefined,
        creditCardId: card,
        source: 'installment',
        installmentPurchaseId: oid(),
      });
      await expense(600, '2026-03-25T10:00:00Z', { source: 'installment' }); // interest
      const report = await service.spendingByCategory(String(u1), march);
      expect(report.totalCents).toBe(120600);
    });

    it('includes the last millisecond of the range and excludes the next instant', async () => {
      await expense(1, '2026-03-01T00:00:00.000Z');
      await expense(10, '2026-03-31T23:59:59.999Z');
      await expense(100, '2026-04-01T00:00:00.000Z');
      await expense(1000, '2026-02-28T23:59:59.999Z');
      const report = await service.spendingByCategory(String(u1), march);
      expect(report.totalCents).toBe(11);
    });

    it('keeps the name of an archived category and tolerates a missing one', async () => {
      await expense(400, '2026-03-05T10:00:00Z', { categoryId: oldCat });
      await expense(300, '2026-03-06T10:00:00Z', { categoryId: oid() });
      const report = await service.spendingByCategory(String(u1), march);
      expect(report.items.map((i) => i.name)).toEqual([
        'Vieja',
        'Sin categoría',
      ]);
    });

    it('returns an empty report when there is nothing in the range', async () => {
      const report = await service.spendingByCategory(String(u1), march);
      expect(report).toMatchObject({ totalCents: 0, items: [] });
    });

    it('defaults to the month of `now`', async () => {
      await expense(500, '2026-03-05T10:00:00Z');
      await expense(700, '2026-04-05T10:00:00Z');
      const report = await service.spendingByCategory(
        String(u1),
        {},
        at('2026-04-20T12:00:00Z'),
      );
      expect(report.totalCents).toBe(700);
      expect(report.from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
      expect(report.to.toISOString()).toBe('2026-04-30T23:59:59.999Z');
    });

    it('rejects a range whose start is after its end', async () => {
      await expect(
        service.spendingByCategory(String(u1), {
          from: at('2026-04-01T00:00:00Z'),
          to: at('2026-03-01T00:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('incomeVsExpenses', () => {
    it('adds income and expenses per month, ignoring transfers and other users, with empty months at zero', async () => {
      await income(100000, '2026-01-10T10:00:00Z');
      await expense(30000, '2026-01-12T10:00:00Z');
      await expense(5000, '2026-01-20T10:00:00Z', {
        accountId: undefined,
        creditCardId: card,
      });
      await income(50000, '2026-03-02T10:00:00Z');
      await expense(20000, '2026-03-15T10:00:00Z', { categoryId: transport });
      await txModel.create({
        userId: u1,
        type: 'transfer',
        amountCents: 99999,
        date: at('2026-02-10T10:00:00Z'),
        accountId: account,
        toAccountId: oid(),
      });
      await txModel.create({
        userId: u2,
        type: 'income',
        amountCents: 77777,
        date: at('2026-01-10T10:00:00Z'),
        accountId: oid(),
        categoryId: foreignCat,
      });

      const report = await service.incomeVsExpenses(String(u1), {
        from: '2026-01',
        to: '2026-03',
      });

      expect(report.from).toBe('2026-01');
      expect(report.to).toBe('2026-03');
      expect(report.months).toEqual([
        {
          month: '2026-01',
          incomeCents: 100000,
          expenseCents: 35000,
          netCents: 65000,
        },
        { month: '2026-02', incomeCents: 0, expenseCents: 0, netCents: 0 },
        {
          month: '2026-03',
          incomeCents: 50000,
          expenseCents: 20000,
          netCents: 30000,
        },
      ]);
    });

    it('puts the last instant of a month in that month and the next one in the following month', async () => {
      await expense(10, '2026-01-31T23:59:59.999Z');
      await expense(100, '2026-02-01T00:00:00.000Z');
      const report = await service.incomeVsExpenses(String(u1), {
        from: '2026-01',
        to: '2026-02',
      });
      expect(report.months.map((m) => m.expenseCents)).toEqual([10, 100]);
    });

    it('shows a negative net when spending exceeds income', async () => {
      await expense(500, '2026-03-05T10:00:00Z');
      const report = await service.incomeVsExpenses(String(u1), {
        from: '2026-03',
        to: '2026-03',
      });
      expect(report.months[0].netCents).toBe(-500);
    });

    it('defaults to the last 12 months ending with the month of `now`', async () => {
      await expense(500, '2026-03-05T10:00:00Z');
      const report = await service.incomeVsExpenses(
        String(u1),
        {},
        at('2026-06-30T12:00:00Z'),
      );
      expect(report.months).toHaveLength(12);
      expect(report.months[0].month).toBe('2025-07');
      expect(report.months[11].month).toBe('2026-06');
      expect(
        report.months.find((m) => m.month === '2026-03')!.expenseCents,
      ).toBe(500);
    });

    it('accepts exactly 60 months and rejects 61, an inverted range and malformed months', async () => {
      const sixty = await service.incomeVsExpenses(String(u1), {
        from: '2021-02',
        to: '2026-01',
      });
      expect(sixty.months).toHaveLength(60);
      await expect(
        service.incomeVsExpenses(String(u1), {
          from: '2021-01',
          to: '2026-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.incomeVsExpenses(String(u1), {
          from: '2026-04',
          to: '2026-03',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.incomeVsExpenses(String(u1), {
          from: '2026-13',
          to: '2026-14',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
