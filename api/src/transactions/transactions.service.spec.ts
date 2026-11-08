import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
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
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionSchema } from './schemas/transaction.schema';
import { TransactionsService } from './transactions.service';

jest.setTimeout(180_000);

const oid = () => new Types.ObjectId();

describe('TransactionsService (integration)', () => {
  let mongo: InMemoryMongo;
  let moduleRef: TestingModule;
  let service: TransactionsService;
  let accounts: AccountsService;
  let accountModel: Model<Account>;
  let categoryModel: Model<Category>;
  let txModel: Model<Transaction>;

  const u1 = oid();
  const u2 = oid();
  let A: string;
  let B: string;
  let archivedAcc: string;
  let foreignAcc: string;
  let expenseCat: string;
  let expenseSub: string;
  let otherExpenseCat: string;
  let incomeCat: string;
  let archivedCat: string;
  let foreignCat: string;

  beforeAll(async () => {
    mongo = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.uri, mongoTestOptions),
        MongooseModule.forFeature([
          { name: Account.name, schema: AccountSchema },
          { name: Category.name, schema: CategorySchema },
          { name: Transaction.name, schema: TransactionSchema },
        ]),
      ],
      providers: [AccountsService, CategoriesService, TransactionsService],
    }).compile();
    service = moduleRef.get(TransactionsService);
    accounts = moduleRef.get(AccountsService);
    accountModel = moduleRef.get(getModelToken(Account.name));
    categoryModel = moduleRef.get(getModelToken(Category.name));
    txModel = moduleRef.get(getModelToken(Transaction.name));
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      accountModel.deleteMany({}),
      categoryModel.deleteMany({}),
      txModel.deleteMany({}),
    ]);
    const acc = (
      userId: Types.ObjectId,
      name: string,
      balanceCents: number,
      isArchived = false,
    ) =>
      accountModel
        .create({ userId, type: 'checking', name, balanceCents, isArchived })
        .then((d) => String(d._id));
    const cat = (
      userId: Types.ObjectId,
      type: 'income' | 'expense',
      name: string,
      extra: Record<string, unknown> = {},
    ) =>
      categoryModel
        .create({ userId, type, name, icon: 'i', color: '#000000', ...extra })
        .then((d) => d);

    A = await acc(u1, 'A', 10_000);
    B = await acc(u1, 'B', 0);
    archivedAcc = await acc(u1, 'Old', 0, true);
    foreignAcc = await acc(u2, 'Foreign', 0);
    const food = await cat(u1, 'expense', 'Comida', {
      subcategories: [{ name: 'Super' }],
    });
    expenseCat = String(food._id);
    expenseSub = String(food.subcategories[0]._id);
    otherExpenseCat = String((await cat(u1, 'expense', 'Transporte'))._id);
    incomeCat = String((await cat(u1, 'income', 'Salario'))._id);
    archivedCat = String(
      (await cat(u1, 'expense', 'Vieja', { isArchived: true }))._id,
    );
    foreignCat = String((await cat(u2, 'expense', 'Ajena'))._id);
  });

  const balance = async (id: string) =>
    (await accountModel.findById(id).lean())!.balanceCents;

  const dto = (over: Record<string, unknown>) =>
    ({
      type: 'expense',
      amountCents: 3000,
      date: new Date('2026-03-15T12:00:00Z'),
      accountId: A,
      categoryId: expenseCat,
      ...over,
    }) as unknown as CreateTransactionDto;

  describe('create', () => {
    it('expense subtracts, income adds', async () => {
      await service.create(String(u1), dto({}));
      expect(await balance(A)).toBe(7_000);
      await service.create(
        String(u1),
        dto({ type: 'income', amountCents: 5000, categoryId: incomeCat }),
      );
      expect(await balance(A)).toBe(12_000);
    });

    it('transfer moves money between accounts and stores no category', async () => {
      const tx = await service.create(
        String(u1),
        dto({
          type: 'transfer',
          amountCents: 2000,
          toAccountId: B,
          categoryId: undefined,
        }),
      );
      expect(await balance(A)).toBe(8_000);
      expect(await balance(B)).toBe(2_000);
      expect(tx.categoryId).toBeUndefined();
    });

    it('defaults source to manual and accepts a valid subcategory', async () => {
      const tx = await service.create(
        String(u1),
        dto({ subcategoryId: expenseSub }),
      );
      expect(tx.source).toBe('manual');
      expect(String(tx.subcategoryId)).toBe(expenseSub);
    });

    it.each([
      ['foreign account', () => ({ accountId: foreignAcc }), NotFoundException],
      [
        'foreign destination account',
        () => ({
          type: 'transfer',
          toAccountId: foreignAcc,
          categoryId: undefined,
        }),
        NotFoundException,
      ],
      [
        'foreign category',
        () => ({ categoryId: foreignCat }),
        NotFoundException,
      ],
      [
        'archived account',
        () => ({ accountId: archivedAcc }),
        ConflictException,
      ],
      [
        'archived category',
        () => ({ categoryId: archivedCat }),
        ConflictException,
      ],
      [
        'income category on an expense',
        () => ({ categoryId: incomeCat }),
        BadRequestException,
      ],
      [
        'subcategory of another category',
        () => ({ categoryId: otherExpenseCat, subcategoryId: expenseSub }),
        BadRequestException,
      ],
      [
        'transfer to the same account',
        () => ({ type: 'transfer', toAccountId: A, categoryId: undefined }),
        BadRequestException,
      ],
    ])('rejects %s without changing anything', async (_n, over, error) => {
      await expect(
        service.create(String(u1), dto(over())),
      ).rejects.toBeInstanceOf(error);
      expect(await txModel.countDocuments({})).toBe(0);
      expect(await balance(A)).toBe(10_000);
      expect(await balance(B)).toBe(0);
    });

    it('rolls back everything when updating balances fails mid-way', async () => {
      jest
        .spyOn(accounts, 'applyDeltas')
        .mockRejectedValueOnce(new Error('boom'));
      await expect(service.create(String(u1), dto({}))).rejects.toThrow('boom');
      expect(await txModel.countDocuments({})).toBe(0);
      expect(await balance(A)).toBe(10_000);
    });

    it('five simultaneous expenses are all reflected in the balance', async () => {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          service.create(String(u1), dto({ amountCents: 1000 })),
        ),
      );
      expect(await balance(A)).toBe(5_000);
      expect(await txModel.countDocuments({})).toBe(5);
    });
  });

  describe('update', () => {
    const upd = (over: Record<string, unknown>) =>
      plainToInstance(UpdateTransactionDto, over);
    const makeExpense = (over: Record<string, unknown> = {}) =>
      service.create(String(u1), dto(over));

    it('changing only the amount adjusts the balance by the difference', async () => {
      const tx = await makeExpense();
      await service.update(
        String(u1),
        String(tx._id),
        upd({ amountCents: 5000 }),
      );
      expect(await balance(A)).toBe(5_000);
    });

    it('changing only the note leaves balances and other fields untouched', async () => {
      const tx = await makeExpense();
      const updated = await service.update(
        String(u1),
        String(tx._id),
        upd({ note: 'hola' }),
      );
      expect(updated.note).toBe('hola');
      expect(updated.amountCents).toBe(3000);
      expect(updated.type).toBe('expense');
      expect(String(updated.accountId)).toBe(A);
      expect(String(updated.categoryId)).toBe(expenseCat);
      expect(await balance(A)).toBe(7_000);
    });

    it('expense -> income swings the balance by twice the amount', async () => {
      const tx = await makeExpense();
      await service.update(
        String(u1),
        String(tx._id),
        upd({ type: 'income', categoryId: incomeCat }),
      );
      expect(await balance(A)).toBe(13_000);
    });

    it('moving to another account undoes the old effect and applies the new', async () => {
      const tx = await makeExpense();
      await service.update(String(u1), String(tx._id), upd({ accountId: B }));
      expect(await balance(A)).toBe(10_000);
      expect(await balance(B)).toBe(-3_000);
    });

    it('changing a transfer destination moves only the credit', async () => {
      const C = String(
        (
          await accountModel.create({
            userId: u1,
            type: 'cash',
            name: 'C',
            balanceCents: 0,
          })
        )._id,
      );
      const tx = await service.create(
        String(u1),
        dto({
          type: 'transfer',
          amountCents: 2000,
          toAccountId: B,
          categoryId: undefined,
        }),
      );
      await service.update(String(u1), String(tx._id), upd({ toAccountId: C }));
      expect(await balance(A)).toBe(8_000);
      expect(await balance(B)).toBe(0);
      expect(await balance(C)).toBe(2_000);
    });

    it('expense -> transfer (clearing the category) credits the destination', async () => {
      const tx = await makeExpense();
      const updated = await service.update(
        String(u1),
        String(tx._id),
        upd({ type: 'transfer', toAccountId: B, categoryId: null }),
      );
      expect(updated.categoryId).toBeUndefined();
      expect(await balance(A)).toBe(7_000);
      expect(await balance(B)).toBe(3_000);
    });

    it('transfer -> expense without a category is rejected and changes nothing', async () => {
      const tx = await service.create(
        String(u1),
        dto({ type: 'transfer', toAccountId: B, categoryId: undefined }),
      );
      await expect(
        service.update(
          String(u1),
          String(tx._id),
          upd({ type: 'expense', toAccountId: null }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await balance(A)).toBe(7_000);
      expect(await balance(B)).toBe(3_000);
      expect((await txModel.findById(tx._id).lean())!.type).toBe('transfer');
    });

    it('changing the category without a subcategory clears the old subcategory', async () => {
      const tx = await makeExpense({ subcategoryId: expenseSub });
      const updated = await service.update(
        String(u1),
        String(tx._id),
        upd({ categoryId: otherExpenseCat }),
      );
      expect(String(updated.categoryId)).toBe(otherExpenseCat);
      expect(updated.subcategoryId).toBeUndefined();
    });

    it('moving to an archived account is rejected, but old references stay editable', async () => {
      const tx = await makeExpense();
      await expect(
        service.update(
          String(u1),
          String(tx._id),
          upd({ accountId: archivedAcc }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await balance(A)).toBe(7_000);

      await accountModel.updateOne({ _id: A }, { isArchived: true });
      const updated = await service.update(
        String(u1),
        String(tx._id),
        upd({ note: 'ok' }),
      );
      expect(updated.note).toBe('ok');
    });

    it("another user's transaction is 404", async () => {
      const tx = await makeExpense();
      await expect(
        service.update(String(u2), String(tx._id), upd({ amountCents: 1 })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await balance(A)).toBe(7_000);
    });

    it('rolls back the document and balances when applying deltas fails', async () => {
      const tx = await makeExpense();
      jest
        .spyOn(accounts, 'applyDeltas')
        .mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.update(String(u1), String(tx._id), upd({ amountCents: 9000 })),
      ).rejects.toThrow('boom');
      expect((await txModel.findById(tx._id).lean())!.amountCents).toBe(3000);
      expect(await balance(A)).toBe(7_000);
    });
  });

  describe('remove / findOne', () => {
    it('remove reverts the balance and deletes the document', async () => {
      const tx = await service.create(String(u1), dto({}));
      expect(await balance(A)).toBe(7_000);
      await service.remove(String(u1), String(tx._id));
      expect(await balance(A)).toBe(10_000);
      expect(await txModel.countDocuments({})).toBe(0);
    });

    it('remove of a transfer reverts both accounts', async () => {
      const tx = await service.create(
        String(u1),
        dto({ type: 'transfer', toAccountId: B, categoryId: undefined }),
      );
      await service.remove(String(u1), String(tx._id));
      expect(await balance(A)).toBe(10_000);
      expect(await balance(B)).toBe(0);
    });

    it("another user's transaction is 404 for findOne and remove", async () => {
      const tx = await service.create(String(u1), dto({}));
      await expect(
        service.findOne(String(u2), String(tx._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.remove(String(u2), String(tx._id)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await balance(A)).toBe(7_000);
    });
  });
});
