import { BadRequestException } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import {
  InMemoryMongo,
  mongoTestOptions,
  startMongo,
} from '../../test/mongo-memory';
import { AccountsService } from '../accounts/accounts.service';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { BudgetsService } from '../budgets/budgets.service';
import { Budget, BudgetSchema } from '../budgets/schemas/budget.schema';
import { CategoriesService } from '../categories/categories.service';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { endOfRange } from '../common/utils/date-range';
import { CreditCardsService } from '../credit-cards/credit-cards.service';
import {
  CreditCard,
  CreditCardSchema,
} from '../credit-cards/schemas/credit-card.schema';
import { InstallmentPurchasesService } from '../installment-purchases/installment-purchases.service';
import {
  InstallmentPurchase,
  InstallmentPurchaseSchema,
} from '../installment-purchases/schemas/installment-purchase.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/schemas/subscription.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TransactionsService } from '../transactions/transactions.service';
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
  let accountModel: Model<Account>;
  let cardModel: Model<CreditCard>;
  let budgetModel: Model<Budget>;
  let subModel: Model<Subscription>;
  let purchaseModel: Model<InstallmentPurchase>;

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
          { name: Account.name, schema: AccountSchema },
          { name: Budget.name, schema: BudgetSchema },
          { name: Category.name, schema: CategorySchema },
          { name: CreditCard.name, schema: CreditCardSchema },
          { name: InstallmentPurchase.name, schema: InstallmentPurchaseSchema },
          { name: Subscription.name, schema: SubscriptionSchema },
          { name: Transaction.name, schema: TransactionSchema },
        ]),
      ],
      providers: [
        AccountsService,
        BudgetsService,
        CategoriesService,
        CreditCardsService,
        InstallmentPurchasesService,
        ReportsService,
        SubscriptionsService,
        TransactionsService,
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
    txModel = moduleRef.get(getModelToken(Transaction.name));
    categoryModel = moduleRef.get(getModelToken(Category.name));
    accountModel = moduleRef.get(getModelToken(Account.name));
    cardModel = moduleRef.get(getModelToken(CreditCard.name));
    budgetModel = moduleRef.get(getModelToken(Budget.name));
    subModel = moduleRef.get(getModelToken(Subscription.name));
    purchaseModel = moduleRef.get(getModelToken(InstallmentPurchase.name));
    await budgetModel.init();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all(
      [
        txModel,
        categoryModel,
        accountModel,
        cardModel,
        budgetModel,
        subModel,
        purchaseModel,
      ].map((m) => m.deleteMany({})),
    );
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

  describe('budgetVsSpent', () => {
    const budget = (
      categoryId: Types.ObjectId,
      month: string,
      limitCents: number,
      userId: Types.ObjectId = u1,
    ) => budgetModel.create({ userId, categoryId, month, limitCents });

    it('compares a budget with the month spending, subcategories and cards included', async () => {
      await budget(food, '2026-03', 50000);
      await expense(12000, '2026-03-05T10:00:00Z', { subcategoryId: oid() });
      await expense(8000, '2026-03-20T10:00:00Z', {
        accountId: undefined,
        creditCardId: card,
      });

      const report = await service.budgetVsSpent(String(u1), '2026-03');

      expect(report.month).toBe('2026-03');
      expect(report.items).toHaveLength(1);
      const { budgetId, ...rest } = report.items[0];
      expect(budgetId).toBeTruthy();
      expect(rest).toEqual({
        categoryId: String(food),
        name: 'Alimentación',
        icon: 'Alimentación-icon',
        color: '#112233',
        limitCents: 50000,
        spentCents: 20000,
        remainingCents: 30000,
        percentUsed: 40,
        overBudget: false,
      });
      expect(report.totals).toEqual({
        limitCents: 50000,
        spentCents: 20000,
        overBudgetCount: 0,
      });
    });

    it.each([
      [100000, 0, 0, 100000, false],
      [100000, 100000, 100, 0, false], // exactly at the limit is not over
      [50000, 62500, 125, -12500, true],
      [100000, 33333, 33.3, 66667, false],
    ])(
      'limit %i, spent %i -> %f%% used, %i left, over: %s',
      async (limit, spent, percent, remaining, over) => {
        await budget(food, '2026-03', limit);
        if (spent > 0) await expense(spent, '2026-03-10T10:00:00Z');
        const [item] = (await service.budgetVsSpent(String(u1), '2026-03'))
          .items;
        expect(item.spentCents).toBe(spent);
        expect(item.percentUsed).toBe(percent);
        expect(item.remainingCents).toBe(remaining);
        expect(item.overBudget).toBe(over);
      },
    );

    it('lists the most used budgets first and totals only budgeted categories', async () => {
      await budget(food, '2026-03', 10000); // spends 15000 -> 150%
      await budget(transport, '2026-03', 10000); // spends 5000 -> 50%
      await expense(15000, '2026-03-05T10:00:00Z');
      await expense(5000, '2026-03-06T10:00:00Z', { categoryId: transport });
      await expense(99999, '2026-03-07T10:00:00Z', { categoryId: oldCat }); // no budget
      const report = await service.budgetVsSpent(String(u1), '2026-03');
      expect(report.items.map((i) => i.name)).toEqual([
        'Alimentación',
        'Transporte',
      ]);
      expect(report.totals).toEqual({
        limitCents: 20000,
        spentCents: 20000,
        overBudgetCount: 1,
      });
    });

    it('ignores other months, income, transfers and other users', async () => {
      await budget(food, '2026-03', 50000);
      await expense(1000, '2026-03-05T10:00:00Z');
      await expense(7000, '2026-04-01T00:00:00Z'); // next month
      await expense(7000, '2026-02-28T23:59:59.999Z'); // previous month
      await income(5000, '2026-03-06T10:00:00Z', { categoryId: food });
      await txModel.create({
        userId: u1,
        type: 'transfer',
        amountCents: 4000,
        date: at('2026-03-07T10:00:00Z'),
        accountId: account,
        toAccountId: oid(),
      });
      await txModel.create({
        userId: u2,
        type: 'expense',
        amountCents: 9000,
        date: at('2026-03-08T10:00:00Z'),
        accountId: oid(),
        categoryId: food,
      });
      const [item] = (await service.budgetVsSpent(String(u1), '2026-03')).items;
      expect(item.spentCents).toBe(1000);
    });

    it('shows other users nothing and keeps the name of an archived category', async () => {
      await budget(oldCat, '2026-03', 3000);
      await expense(1000, '2026-03-05T10:00:00Z', { categoryId: oldCat });
      expect(
        (await service.budgetVsSpent(String(u1), '2026-03')).items[0].name,
      ).toBe('Vieja');
      expect(await service.budgetVsSpent(String(u2), '2026-03')).toMatchObject({
        items: [],
        totals: { limitCents: 0, spentCents: 0, overBudgetCount: 0 },
      });
    });

    it('defaults to the month of `now` and rejects a malformed month', async () => {
      await budget(food, '2026-04', 1000);
      const report = await service.budgetVsSpent(
        String(u1),
        undefined,
        at('2026-04-15T12:00:00Z'),
      );
      expect(report.month).toBe('2026-04');
      expect(report.items).toHaveLength(1);
      await expect(
        service.budgetVsSpent(String(u1), '2026-13'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cardDebt', () => {
    const makeCard = (
      userId: Types.ObjectId,
      name: string,
      limitCents: number,
      debtCents: number,
      isArchived = false,
    ) =>
      cardModel.create({
        userId,
        name,
        limitCents,
        debtCents,
        cutoffDay: 15,
        paymentDay: 5,
        isArchived,
      });

    it('totals active cards only and projects the installments', async () => {
      const visa = await makeCard(u1, 'Visa', 100000, 30000);
      await makeCard(u1, 'Master', 50000, 10000);
      await makeCard(u1, 'Vieja', 99999, 1111, true);
      await makeCard(u2, 'Ajena', 77777, 7777);
      await purchaseModel.create({
        userId: u1,
        creditCardId: visa._id,
        description: 'Laptop',
        categoryId: food,
        totalCents: 60000,
        installments: 6,
        annualRatePercent: 0,
        startDate: at('2026-03-10T00:00:00Z'),
        firstDueDate: at('2026-04-05T00:00:00Z'),
        paymentDay: 5,
        paidInstallments: 0,
        purchaseTransactionId: oid(),
      });

      const report = await service.cardDebt(
        String(u1),
        3,
        at('2026-03-20T12:00:00Z'),
      );

      expect(report.totalDebtCents).toBe(40000);
      expect(report.totalLimitCents).toBe(150000);
      expect(report.totalAvailableCents).toBe(110000);
      expect(report.cards.map((c) => c.name).sort()).toEqual([
        'Master',
        'Visa',
      ]);
      expect(report.cards.find((c) => c.name === 'Visa')).toMatchObject({
        debtCents: 30000,
        limitCents: 100000,
        availableCents: 70000,
      });
      expect(report.projectedPayments.map((m) => m.month)).toEqual([
        '2026-03',
        '2026-04',
        '2026-05',
      ]);
      expect(report.projectedPayments.map((m) => m.paymentCents)).toEqual([
        0, 10000, 10000,
      ]);
    });

    it('is empty for a user without cards', async () => {
      const report = await service.cardDebt(
        String(u1),
        2,
        at('2026-03-20T00:00:00Z'),
      );
      expect(report).toMatchObject({
        totalDebtCents: 0,
        totalLimitCents: 0,
        totalAvailableCents: 0,
        cards: [],
      });
      expect(report.projectedPayments).toHaveLength(2);
    });
  });

  describe('summary', () => {
    const now = at('2026-03-20T12:00:00Z');

    it('puts the dashboard numbers together', async () => {
      const mkAccount = (
        userId: Types.ObjectId,
        name: string,
        balanceCents: number,
        isArchived = false,
      ) =>
        accountModel.create({
          userId,
          type: 'checking',
          name,
          balanceCents,
          isArchived,
        });
      const a1 = await mkAccount(u1, 'A1', 50000);
      await mkAccount(u1, 'A2', -2000);
      await mkAccount(u1, 'Archivada', 99999, true);
      await mkAccount(u2, 'Ajena', 8888);
      const visa = await cardModel.create({
        userId: u1,
        name: 'Visa',
        limitCents: 100000,
        debtCents: 30000,
        cutoffDay: 15,
        paymentDay: 5,
      });
      await cardModel.create({
        userId: u1,
        name: 'Vieja',
        limitCents: 1,
        debtCents: 1111,
        cutoffDay: 1,
        paymentDay: 2,
        isArchived: true,
      });

      await expense(20000, '2026-03-05T10:00:00Z');
      await expense(5000, '2026-03-06T10:00:00Z', { categoryId: transport });
      await income(80000, '2026-03-02T10:00:00Z');
      await expense(7000, '2026-04-02T10:00:00Z'); // other month
      await txModel.create({
        userId: u2,
        type: 'expense',
        amountCents: 4242,
        date: at('2026-03-05T10:00:00Z'),
        accountId: oid(),
        categoryId: foreignCat,
      });
      await budgetModel.create({
        userId: u1,
        categoryId: food,
        month: '2026-03',
        limitCents: 15000,
      });
      await budgetModel.create({
        userId: u1,
        categoryId: transport,
        month: '2026-03',
        limitCents: 10000,
      });
      await subModel.create({
        userId: u1,
        name: 'Netflix',
        amountCents: 1500,
        frequency: 'monthly',
        nextDate: at('2026-03-25T00:00:00Z'),
        anchorDay: 25,
        accountId: a1._id,
        categoryId: food,
      });
      await subModel.create({
        userId: u1,
        name: 'Lejana',
        amountCents: 900,
        frequency: 'monthly',
        nextDate: at('2026-06-25T00:00:00Z'),
        anchorDay: 25,
        accountId: a1._id,
        categoryId: food,
      });
      await purchaseModel.create({
        userId: u1,
        creditCardId: visa._id,
        description: 'Laptop',
        categoryId: food,
        totalCents: 60000,
        installments: 6,
        annualRatePercent: 0,
        startDate: at('2026-03-10T00:00:00Z'),
        firstDueDate: at('2026-04-05T00:00:00Z'),
        paymentDay: 5,
        paidInstallments: 0,
        purchaseTransactionId: oid(),
      });

      const summary = await service.summary(String(u1), undefined, now);

      expect(summary.month).toBe('2026-03');
      expect(summary.totalBalanceCents).toBe(48000);
      expect(summary.cardDebtCents).toBe(30000);
      expect(summary.incomeCents).toBe(80000);
      expect(summary.expenseCents).toBe(25000);
      expect(summary.netCents).toBe(55000);
      expect(summary.topCategories.map((c) => [c.name, c.totalCents])).toEqual([
        ['Alimentación', 20000],
        ['Transporte', 5000],
      ]);
      expect(summary.budgets).toEqual({
        limitCents: 25000,
        spentCents: 25000,
        overBudgetCount: 1,
      });
      expect(summary.upcomingSubscriptions.map((s) => s.name)).toEqual([
        'Netflix',
      ]);
      expect(summary.installmentProjection.map((m) => m.paymentCents)).toEqual([
        0, 10000, 10000,
      ]);
    });

    it('lists at most the 5 biggest categories', async () => {
      for (let i = 1; i <= 7; i++) {
        const c = await categoryModel.create({
          userId: u1,
          type: 'expense',
          name: `Cat ${i}`,
          icon: 'i',
          color: '#000000',
        });
        await expense(i * 100, '2026-03-10T10:00:00Z', { categoryId: c._id });
      }
      const summary = await service.summary(String(u1), '2026-03', now);
      expect(summary.topCategories).toHaveLength(5);
      expect(summary.topCategories[0].totalCents).toBe(700);
    });

    it('is all zeros and empty lists for a user without data', async () => {
      const summary = await service.summary(String(oid()), undefined, now);
      expect(summary).toMatchObject({
        month: '2026-03',
        totalBalanceCents: 0,
        cardDebtCents: 0,
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
        topCategories: [],
        budgets: { limitCents: 0, spentCents: 0, overBudgetCount: 0 },
        upcomingSubscriptions: [],
      });
      expect(summary.installmentProjection).toHaveLength(3);
    });

    it('rejects a malformed month', async () => {
      await expect(
        service.summary(String(u1), '2026-3', now),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
