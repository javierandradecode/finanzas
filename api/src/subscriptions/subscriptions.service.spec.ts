import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
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
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpcomingQuery } from './dto/upcoming.query';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import { SubscriptionsService } from './subscriptions.service';

jest.setTimeout(180_000);

const oid = () => new Types.ObjectId();
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

describe('SubscriptionsService (integration)', () => {
  let mongo: InMemoryMongo;
  let moduleRef: TestingModule;
  let service: SubscriptionsService;
  let accountModel: Model<Account>;
  let categoryModel: Model<Category>;
  let cardModel: Model<CreditCard>;
  let subModel: Model<Subscription>;

  const u1 = oid();
  const u2 = oid();
  let A: string;
  let archivedAcc: string;
  let foreignAcc: string;
  let K: string;
  let archivedCard: string;
  let foreignCard: string;
  let expenseCat: string;
  let incomeCat: string;
  let foreignCat: string;

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
          { name: Subscription.name, schema: SubscriptionSchema },
        ]),
      ],
      providers: [
        AccountsService,
        CategoriesService,
        CreditCardsService,
        TransactionsService,
        SubscriptionsService,
      ],
    }).compile();
    service = moduleRef.get(SubscriptionsService);
    accountModel = moduleRef.get(getModelToken(Account.name));
    categoryModel = moduleRef.get(getModelToken(Category.name));
    cardModel = moduleRef.get(getModelToken(CreditCard.name));
    subModel = moduleRef.get(getModelToken(Subscription.name));
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all(
      [accountModel, categoryModel, cardModel, subModel].map((m) =>
        m.deleteMany({}),
      ),
    );
    const acc = (userId: Types.ObjectId, name: string, isArchived = false) =>
      accountModel
        .create({
          userId,
          type: 'checking',
          name,
          balanceCents: 100_000,
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
    expenseCat = await cat(u1, 'expense', 'Entretenimiento');
    incomeCat = await cat(u1, 'income', 'Salario');
    foreignCat = await cat(u2, 'expense', 'Ajena');
  });

  const dto = (over: Record<string, unknown> = {}) =>
    ({
      name: 'Netflix',
      amountCents: 1500,
      frequency: 'monthly',
      nextDate: day('2026-04-05'),
      accountId: A,
      categoryId: expenseCat,
      ...over,
    }) as unknown as CreateSubscriptionDto;

  const upd = (over: Record<string, unknown>) =>
    plainToInstance(UpdateSubscriptionDto, over);

  describe('create', () => {
    it('normalises nextDate to UTC midnight and stores the anchor day', async () => {
      const sub = await service.create(
        String(u1),
        dto({ nextDate: new Date('2026-03-31T15:00:00Z') }),
      );
      expect(sub.nextDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
      expect(sub.anchorDay).toBe(31);
      expect(sub.active).toBe(true);
      expect(String(sub.accountId)).toBe(A);
    });

    it('accepts a credit card as payer', async () => {
      const sub = await service.create(
        String(u1),
        dto({ accountId: undefined, creditCardId: K }),
      );
      expect(String(sub.creditCardId)).toBe(K);
      expect(sub.accountId).toBeUndefined();
    });

    it.each([
      [
        'account and card together',
        () => ({ creditCardId: K }),
        BadRequestException,
      ],
      [
        'neither account nor card',
        () => ({ accountId: undefined }),
        BadRequestException,
      ],
      [
        'a foreign account',
        () => ({ accountId: foreignAcc }),
        NotFoundException,
      ],
      [
        'a foreign card',
        () => ({ accountId: undefined, creditCardId: foreignCard }),
        NotFoundException,
      ],
      [
        'an archived account',
        () => ({ accountId: archivedAcc }),
        ConflictException,
      ],
      [
        'an archived card',
        () => ({ accountId: undefined, creditCardId: archivedCard }),
        ConflictException,
      ],
      [
        'an income category',
        () => ({ categoryId: incomeCat }),
        BadRequestException,
      ],
      [
        'a foreign category',
        () => ({ categoryId: foreignCat }),
        NotFoundException,
      ],
    ])('rejects %s and stores nothing', async (_n, over, error) => {
      await expect(
        service.create(String(u1), dto(over())),
      ).rejects.toBeInstanceOf(error);
      expect(await subModel.countDocuments({})).toBe(0);
    });
  });

  describe('DTO validation', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const body = {
      name: 'Netflix',
      amountCents: 1500,
      frequency: 'monthly',
      nextDate: '2026-04-05',
      categoryId: new Types.ObjectId().toString(),
      accountId: new Types.ObjectId().toString(),
    };
    const run = (over: Record<string, unknown>) =>
      pipe.transform(
        { ...body, ...over },
        { type: 'body', metatype: CreateSubscriptionDto },
      );

    it('accepts a valid body and converts nextDate to a Date', async () => {
      const result = (await run({})) as CreateSubscriptionDto;
      expect(result.nextDate).toBeInstanceOf(Date);
    });

    it.each([
      ['amountCents 0', { amountCents: 0 }],
      ['fractional amountCents', { amountCents: 10.5 }],
      ['unknown frequency', { frequency: 'daily' }],
      ['invalid nextDate', { nextDate: 'not-a-date' }],
      ['empty name', { name: '' }],
    ])('rejects %s', async (_n, over) => {
      await expect(run(over)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['0', '366', 'abc'])(
      'UpcomingQuery rejects days=%s',
      async (days) => {
        await expect(
          pipe.transform({ days }, { type: 'query', metatype: UpcomingQuery }),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it('UpcomingQuery defaults to 30 days', async () => {
      const q = (await pipe.transform(
        {},
        { type: 'query', metatype: UpcomingQuery },
      )) as UpcomingQuery;
      expect(q.days).toBe(30);
    });
  });

  describe('update / pause / reactivate', () => {
    it('changes name and amount without touching other fields (DTO instance with undefined keys)', async () => {
      const sub = await service.create(String(u1), dto());
      const updated = await service.update(
        String(u1),
        String(sub._id),
        upd({ name: 'Netflix Premium', amountCents: 2200 }),
      );
      expect(updated.name).toBe('Netflix Premium');
      expect(updated.amountCents).toBe(2200);
      expect(updated.frequency).toBe('monthly');
      expect(String(updated.accountId)).toBe(A);
      expect(isoDay(updated.nextDate)).toBe('2026-04-05');
      expect(updated.active).toBe(true);
    });

    it('changing nextDate recalculates the anchor day', async () => {
      const sub = await service.create(String(u1), dto());
      const updated = await service.update(
        String(u1),
        String(sub._id),
        upd({ nextDate: '2026-05-31T09:00:00Z' }),
      );
      expect(isoDay(updated.nextDate)).toBe('2026-05-31');
      expect(updated.anchorDay).toBe(31);
    });

    it('switches the payer from an account to a card', async () => {
      const sub = await service.create(String(u1), dto());
      const updated = await service.update(
        String(u1),
        String(sub._id),
        upd({ accountId: null, creditCardId: K }),
      );
      expect(updated.accountId).toBeUndefined();
      expect(String(updated.creditCardId)).toBe(K);
    });

    it('rejects a payer that is invalid after merging (account + card)', async () => {
      const sub = await service.create(String(u1), dto());
      await expect(
        service.update(String(u1), String(sub._id), upd({ creditCardId: K })),
      ).rejects.toBeInstanceOf(BadRequestException);
      const stored = await subModel.findById(sub._id).lean();
      expect(stored!.creditCardId).toBeUndefined();
    });

    it('keeps an old archived payer editable (only new references are checked)', async () => {
      const sub = await service.create(String(u1), dto());
      await accountModel.updateOne({ _id: A }, { isArchived: true });
      const updated = await service.update(
        String(u1),
        String(sub._id),
        upd({ name: 'Renombrada' }),
      );
      expect(updated.name).toBe('Renombrada');
    });

    it('pause sets active=false without deleting', async () => {
      const sub = await service.create(String(u1), dto());
      await service.pause(String(u1), String(sub._id));
      const stored = await subModel.findById(sub._id).lean();
      expect(stored!.active).toBe(false);
    });

    it('reactivating a paused subscription skips the paused period (no backfill) and clears the error', async () => {
      const sub = await service.create(
        String(u1),
        dto({ nextDate: day('2026-03-15') }),
      );
      await service.pause(String(u1), String(sub._id));
      await subModel.updateOne(
        { _id: sub._id },
        { lastError: 'boom', lastErrorAt: new Date() },
      );
      const updated = await service.update(
        String(u1),
        String(sub._id),
        upd({ active: true }),
        day('2026-06-20'),
      );
      expect(updated.active).toBe(true);
      expect(isoDay(updated.nextDate)).toBe('2026-07-15');
      expect(updated.lastError).toBeUndefined();
      expect(updated.lastErrorAt).toBeUndefined();
    });

    it('reactivating with a future nextDate leaves it alone', async () => {
      const sub = await service.create(
        String(u1),
        dto({ nextDate: day('2026-09-01') }),
      );
      await service.pause(String(u1), String(sub._id));
      const updated = await service.update(
        String(u1),
        String(sub._id),
        upd({ active: true }),
        day('2026-06-20'),
      );
      expect(isoDay(updated.nextDate)).toBe('2026-09-01');
    });
  });

  describe('queries and ownership', () => {
    it('findAll lists only the user subscriptions', async () => {
      await service.create(String(u1), dto());
      await subModel.create({
        userId: u2,
        name: 'Ajena',
        amountCents: 1,
        frequency: 'monthly',
        nextDate: day('2026-04-05'),
        anchorDay: 5,
        accountId: foreignAcc,
        categoryId: foreignCat,
      });
      expect(await service.findAll(String(u1))).toHaveLength(1);
      expect(await service.findAll(String(u2))).toHaveLength(1);
    });

    it("another user's subscription is 404 for findOne, update and pause", async () => {
      const sub = await service.create(String(u1), dto());
      const id = String(sub._id);
      await expect(service.findOne(String(u2), id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(String(u2), id, upd({ name: 'x' })),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.pause(String(u2), id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('upcoming', () => {
    const now = day('2026-03-20');

    it('lists each charge in the window, earliest first', async () => {
      await service.create(
        String(u1),
        dto({ name: 'Mensual', nextDate: day('2026-04-05') }),
      );
      await service.create(
        String(u1),
        dto({
          name: 'Semanal',
          frequency: 'weekly',
          nextDate: day('2026-03-23'),
        }),
      );
      const result = await service.upcoming(String(u1), 30, now);
      expect(result.map((c) => `${isoDay(c.date)} ${c.name}`)).toEqual([
        '2026-03-23 Semanal',
        '2026-03-30 Semanal',
        '2026-04-05 Mensual',
        '2026-04-06 Semanal',
        '2026-04-13 Semanal',
      ]); // window ends 2026-04-19, so the 2026-04-20 weekly charge is out
      expect(result[0]).toMatchObject({
        amountCents: 1500,
        overdue: false,
        frequency: 'weekly',
        accountId: A,
      });
    });

    it('marks unprocessed past charges as overdue and puts them first', async () => {
      await service.create(
        String(u1),
        dto({ name: 'Atrasada', nextDate: day('2026-03-10') }),
      );
      await service.create(
        String(u1),
        dto({ name: 'Futura', nextDate: day('2026-03-25') }),
      );
      const result = await service.upcoming(String(u1), 10, now);
      expect(result[0]).toMatchObject({ name: 'Atrasada', overdue: true });
      expect(result[1]).toMatchObject({ name: 'Futura', overdue: false });
    });

    it('excludes paused subscriptions and other users', async () => {
      const paused = await service.create(String(u1), dto({ name: 'Pausada' }));
      await service.pause(String(u1), String(paused._id));
      await subModel.create({
        userId: u2,
        name: 'Ajena',
        amountCents: 1,
        frequency: 'monthly',
        nextDate: day('2026-04-05'),
        anchorDay: 5,
        accountId: foreignAcc,
        categoryId: foreignCat,
      });
      expect(await service.upcoming(String(u1), 60, now)).toEqual([]);
    });

    it('lists a card-paid subscription with its creditCardId', async () => {
      await service.create(
        String(u1),
        dto({
          accountId: undefined,
          creditCardId: K,
          nextDate: day('2026-03-25'),
        }),
      );
      const [first] = await service.upcoming(String(u1), 10, now);
      expect(first.creditCardId).toBe(K);
      expect(first.accountId).toBeUndefined();
    });
  });
});
