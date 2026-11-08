import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
import { CategoriesService } from '../categories/categories.service';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { CreditCardsService } from '../credit-cards/credit-cards.service';
import {
  CreditCard,
  CreditCardSchema,
} from '../credit-cards/schemas/credit-card.schema';
import {
  Transaction,
  TransactionSchema,
} from '../transactions/schemas/transaction.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateInstallmentPurchaseDto } from './dto/create-installment-purchase.dto';
import { InstallmentPurchasesService } from './installment-purchases.service';
import {
  InstallmentPurchase,
  InstallmentPurchaseSchema,
} from './schemas/installment-purchase.schema';

jest.setTimeout(180_000);

const oid = () => new Types.ObjectId();
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

describe('InstallmentPurchasesService (integration)', () => {
  let mongo: InMemoryMongo;
  let moduleRef: TestingModule;
  let service: InstallmentPurchasesService;
  let cards: CreditCardsService;
  let transactions: TransactionsService;
  let accountModel: Model<Account>;
  let categoryModel: Model<Category>;
  let cardModel: Model<CreditCard>;
  let txModel: Model<Transaction>;
  let purchaseModel: Model<InstallmentPurchase>;

  const u1 = oid();
  const u2 = oid();
  let A: string;
  let archivedAcc: string;
  let foreignAcc: string;
  let K: string;
  let archivedCard: string;
  let foreignCard: string;
  let expenseCat: string;
  let otherExpenseCat: string;
  let incomeCat: string;

  beforeAll(async () => {
    mongo = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.uri, mongoTestOptions),
        MongooseModule.forFeature([
          { name: Account.name, schema: AccountSchema },
          { name: Category.name, schema: CategorySchema },
          { name: CreditCard.name, schema: CreditCardSchema },
          { name: Transaction.name, schema: TransactionSchema },
          { name: InstallmentPurchase.name, schema: InstallmentPurchaseSchema },
        ]),
      ],
      providers: [
        AccountsService,
        CategoriesService,
        CreditCardsService,
        TransactionsService,
        InstallmentPurchasesService,
      ],
    }).compile();
    service = moduleRef.get(InstallmentPurchasesService);
    cards = moduleRef.get(CreditCardsService);
    transactions = moduleRef.get(TransactionsService);
    accountModel = moduleRef.get(getModelToken(Account.name));
    categoryModel = moduleRef.get(getModelToken(Category.name));
    cardModel = moduleRef.get(getModelToken(CreditCard.name));
    txModel = moduleRef.get(getModelToken(Transaction.name));
    purchaseModel = moduleRef.get(getModelToken(InstallmentPurchase.name));
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(
      [accountModel, categoryModel, cardModel, txModel, purchaseModel].map(
        (m) => m.deleteMany({}),
      ),
    );
    const acc = (userId: Types.ObjectId, name: string, isArchived = false) =>
      accountModel
        .create({
          userId,
          type: 'checking',
          name,
          balanceCents: 500_000,
          isArchived,
        })
        .then((d) => String(d._id));
    const card = (userId: Types.ObjectId, name: string, isArchived = false) =>
      cardModel
        .create({
          userId,
          name,
          limitCents: 500_000,
          cutoffDay: 15,
          paymentDay: 5,
          isArchived,
        })
        .then((d) => String(d._id));
    const cat = (
      userId: Types.ObjectId,
      type: 'income' | 'expense',
      name: string,
    ) =>
      categoryModel
        .create({ userId, type, name, icon: 'i', color: '#000000' })
        .then((d) => String(d._id));

    A = await acc(u1, 'A');
    archivedAcc = await acc(u1, 'Old', true);
    foreignAcc = await acc(u2, 'Foreign');
    K = await card(u1, 'Visa');
    archivedCard = await card(u1, 'Vieja', true);
    foreignCard = await card(u2, 'Ajena');
    expenseCat = await cat(u1, 'expense', 'Tecnología');
    otherExpenseCat = await cat(u1, 'expense', 'Hogar');
    incomeCat = await cat(u1, 'income', 'Salario');
  });

  const balance = async (id: string) =>
    (await accountModel.findById(id).lean())!.balanceCents;
  const debt = async (id: string) =>
    (await cardModel.findById(id).lean())!.debtCents;

  const dto = (over: Record<string, unknown> = {}) =>
    ({
      creditCardId: K,
      description: 'Laptop',
      categoryId: expenseCat,
      totalCents: 120_000,
      installments: 12,
      annualRatePercent: 0,
      startDate: day('2026-03-10'),
      ...over,
    }) as unknown as CreateInstallmentPurchaseDto;

  const create = (over: Record<string, unknown> = {}, user = u1) =>
    service.create(String(user), dto(over));

  describe('create', () => {
    it('records the purchase, raises the debt by the full total and builds the schedule', async () => {
      const view = await create();
      expect(await debt(K)).toBe(120_000);

      const txs = await txModel.find({}).lean();
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({
        type: 'expense',
        amountCents: 120_000,
        source: 'installment',
      });
      expect(String(txs[0].creditCardId)).toBe(K);
      expect(String(txs[0].installmentPurchaseId)).toBe(String(view._id));
      expect(String(view.purchaseTransactionId)).toBe(String(txs[0]._id));

      expect(isoDay(view.firstDueDate)).toBe('2026-04-05');
      expect(view.paymentDay).toBe(5);
      expect(view.paidInstallments).toBe(0);
      expect(view.schedule).toHaveLength(12);
      expect(view.schedule.every((i) => i.paymentCents === 10_000)).toBe(true);
      expect(view.schedule.every((i) => !i.paid)).toBe(true);
      expect(view.isPaidOff).toBe(false);
    });

    it('a purchase after the cutoff day starts one statement later', async () => {
      const view = await create({ startDate: day('2026-03-16') });
      expect(isoDay(view.firstDueDate)).toBe('2026-05-05');
    });

    it.each([
      [
        'a foreign card',
        () => ({ creditCardId: foreignCard }),
        NotFoundException,
      ],
      [
        'an archived card',
        () => ({ creditCardId: archivedCard }),
        ConflictException,
      ],
      [
        'an income category',
        () => ({ categoryId: incomeCat }),
        BadRequestException,
      ],
      [
        'fewer cents than installments',
        () => ({ totalCents: 1, installments: 2 }),
        BadRequestException,
      ],
      [
        'an amount too small to amortise',
        () => ({ totalCents: 100, installments: 60, annualRatePercent: 100 }),
        BadRequestException,
      ],
    ])(
      'rejects %s without leaving anything behind',
      async (_n, over, error) => {
        await expect(create(over())).rejects.toBeInstanceOf(error);
        expect(await purchaseModel.countDocuments({})).toBe(0);
        expect(await txModel.countDocuments({})).toBe(0);
        expect(await debt(K)).toBe(0);
      },
    );

    it('rolls back everything when updating the debt fails', async () => {
      jest
        .spyOn(cards, 'applyDebtDeltas')
        .mockRejectedValueOnce(new Error('boom'));
      await expect(create()).rejects.toThrow('boom');
      expect(await purchaseModel.countDocuments({})).toBe(0);
      expect(await txModel.countDocuments({})).toBe(0);
      expect(await debt(K)).toBe(0);
    });
  });

  describe('payNext', () => {
    it('pays capital to the card and interest as an expense (12% over 12 months)', async () => {
      const view = await create({ annualRatePercent: 12 });
      const updated = await service.payNext(String(u1), String(view._id), {
        accountId: A,
        date: day('2026-04-05'),
      });

      expect(await balance(A)).toBe(500_000 - 10_662);
      expect(await debt(K)).toBe(120_000 - 9_462);
      expect(updated.paidInstallments).toBe(1);
      expect(updated.schedule[0].paid).toBe(true);
      expect(updated.schedule[1].paid).toBe(false);

      const payment = await txModel.findOne({ type: 'transfer' }).lean();
      expect(payment).toMatchObject({
        amountCents: 9_462,
        source: 'installment',
      });
      expect(String(payment!.toCreditCardId)).toBe(K);
      expect(String(payment!.installmentPurchaseId)).toBe(String(view._id));

      const interest = await txModel
        .findOne({ type: 'expense', accountId: A })
        .lean();
      expect(interest).toMatchObject({
        amountCents: 1_200,
        source: 'installment',
      });
      expect(String(interest!.categoryId)).toBe(expenseCat);
    });

    it('with no interest it only creates the transfer', async () => {
      const view = await create();
      await service.payNext(String(u1), String(view._id), { accountId: A });
      expect(await balance(A)).toBe(500_000 - 10_000);
      expect(await debt(K)).toBe(120_000 - 10_000);
      expect(
        await txModel.countDocuments({ type: 'expense', accountId: A }),
      ).toBe(0);
    });

    it('rejects paying once every installment is paid', async () => {
      const view = await create({ totalCents: 3_000, installments: 3 });
      for (let i = 0; i < 3; i++) {
        await service.payNext(String(u1), String(view._id), { accountId: A });
      }
      const done = await service.findOne(String(u1), String(view._id));
      expect(done.isPaidOff).toBe(true);
      await expect(
        service.payNext(String(u1), String(view._id), { accountId: A }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await debt(K)).toBe(0);
    });

    it('rejects an archived (409) or foreign (404) paying account without changes', async () => {
      const view = await create();
      await expect(
        service.payNext(String(u1), String(view._id), {
          accountId: archivedAcc,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.payNext(String(u1), String(view._id), {
          accountId: foreignAcc,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        (await service.findOne(String(u1), String(view._id))).paidInstallments,
      ).toBe(0);
      expect(await debt(K)).toBe(120_000);
    });

    it('rolls back the transfer, the counter and the balances when the interest expense fails', async () => {
      const view = await create({ annualRatePercent: 12 });
      const real = transactions.createWithin.bind(transactions);
      jest
        .spyOn(transactions, 'createWithin')
        .mockImplementationOnce(real)
        .mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.payNext(String(u1), String(view._id), { accountId: A }),
      ).rejects.toThrow('boom');
      expect(await txModel.countDocuments({})).toBe(1); // only the purchase expense
      expect(await balance(A)).toBe(500_000);
      expect(await debt(K)).toBe(120_000);
      expect(
        (await service.findOne(String(u1), String(view._id))).paidInstallments,
      ).toBe(0);
    });

    it('two simultaneous payments: one succeeds, the other gets 409', async () => {
      const view = await create();
      const results = await Promise.allSettled([
        service.payNext(String(u1), String(view._id), { accountId: A }),
        service.payNext(String(u1), String(view._id), { accountId: A }),
      ]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toBeInstanceOf(ConflictException);
      expect(
        (await service.findOne(String(u1), String(view._id))).paidInstallments,
      ).toBe(1);
      expect(await balance(A)).toBe(500_000 - 10_000);
      expect(await debt(K)).toBe(120_000 - 10_000);
    });
  });

  describe('remove', () => {
    it('with no payments deletes the purchase and its expense and reverts the debt', async () => {
      const view = await create();
      await service.remove(String(u1), String(view._id));
      expect(await purchaseModel.countDocuments({})).toBe(0);
      expect(await txModel.countDocuments({})).toBe(0);
      expect(await debt(K)).toBe(0);
    });

    it('with a paid installment it is rejected and nothing changes', async () => {
      const view = await create();
      await service.payNext(String(u1), String(view._id), { accountId: A });
      await expect(
        service.remove(String(u1), String(view._id)),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await purchaseModel.countDocuments({})).toBe(1);
      expect(await debt(K)).toBe(110_000);
    });
  });

  describe('update', () => {
    it('changes the description and category, also on the purchase expense, without touching money', async () => {
      const view = await create();
      const updated = await service.update(String(u1), String(view._id), {
        description: 'Laptop gamer',
        categoryId: otherExpenseCat,
      });
      expect(updated.description).toBe('Laptop gamer');
      expect(String(updated.categoryId)).toBe(otherExpenseCat);
      const tx = await txModel.findById(view.purchaseTransactionId).lean();
      expect(String(tx!.categoryId)).toBe(otherExpenseCat);
      expect(tx!.note).toBe('Laptop gamer');
      expect(await debt(K)).toBe(120_000);
      expect(updated.totalCents).toBe(120_000);
    });

    it('rejects an income category', async () => {
      const view = await create();
      await expect(
        service.update(String(u1), String(view._id), { categoryId: incomeCat }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('queries and ownership', () => {
    it('findAll lists only the user purchases and can filter by card', async () => {
      await create();
      const k2 = String(
        (
          await cardModel.create({
            userId: u1,
            name: 'Master',
            limitCents: 100_000,
            cutoffDay: 20,
            paymentDay: 10,
          })
        )._id,
      );
      await create({ creditCardId: k2, description: 'Otra' });
      const all = await service.findAll(String(u1), {});
      expect(all).toHaveLength(2);
      const onlyK = await service.findAll(String(u1), { creditCardId: K });
      expect(onlyK).toHaveLength(1);
      expect(await service.findAll(String(u2), {})).toHaveLength(0);
    });

    it("another user's purchase is 404 for findOne, update, remove and payNext", async () => {
      const view = await create();
      const id = String(view._id);
      await expect(service.findOne(String(u2), id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(String(u2), id, { description: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(String(u2), id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.payNext(String(u2), id, { accountId: foreignAcc }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await debt(K)).toBe(120_000);
    });
  });
});
