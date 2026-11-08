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
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import {
  MAX_CATCH_UP,
  SubscriptionsProcessor,
} from './subscription-processor.service';

jest.setTimeout(240_000);

const oid = () => new Types.ObjectId();
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

describe('SubscriptionsProcessor (integration)', () => {
  let mongo: InMemoryMongo;
  let moduleRef: TestingModule;
  let processor: SubscriptionsProcessor;
  let transactions: TransactionsService;
  let accountModel: Model<Account>;
  let categoryModel: Model<Category>;
  let cardModel: Model<CreditCard>;
  let txModel: Model<Transaction>;
  let subModel: Model<Subscription>;

  const u1 = oid();
  const u2 = oid();
  let A: string;
  let A2: string;
  let K: string;
  let expenseCat: string;
  let foreignAcc: string;
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
        SubscriptionsProcessor,
      ],
    }).compile();
    processor = moduleRef.get(SubscriptionsProcessor);
    transactions = moduleRef.get(TransactionsService);
    accountModel = moduleRef.get(getModelToken(Account.name));
    categoryModel = moduleRef.get(getModelToken(Category.name));
    cardModel = moduleRef.get(getModelToken(CreditCard.name));
    txModel = moduleRef.get(getModelToken(Transaction.name));
    subModel = moduleRef.get(getModelToken(Subscription.name));
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(
      [accountModel, categoryModel, cardModel, txModel, subModel].map((m) =>
        m.deleteMany({}),
      ),
    );
    const acc = (userId: Types.ObjectId, name: string) =>
      accountModel
        .create({ userId, type: 'checking', name, balanceCents: 1_000_000 })
        .then((d) => String(d._id));
    const cat = (userId: Types.ObjectId, name: string) =>
      categoryModel
        .create({ userId, type: 'expense', name, icon: 'i', color: '#000000' })
        .then((d) => String(d._id));
    A = await acc(u1, 'A');
    A2 = await acc(u1, 'A2');
    foreignAcc = await acc(u2, 'Foreign');
    K = String(
      (
        await cardModel.create({
          userId: u1,
          name: 'Visa',
          limitCents: 500_000,
          cutoffDay: 15,
          paymentDay: 5,
        })
      )._id,
    );
    expenseCat = await cat(u1, 'Entretenimiento');
    foreignCat = await cat(u2, 'Ajena');
  });

  const balance = async (id: string) =>
    (await accountModel.findById(id).lean())!.balanceCents;

  const seed = (over: Record<string, unknown> = {}) =>
    subModel.create({
      userId: u1,
      name: 'Netflix',
      amountCents: 1500,
      frequency: 'monthly',
      nextDate: day('2026-03-15'),
      anchorDay: 15,
      accountId: new Types.ObjectId(A),
      categoryId: new Types.ObjectId(expenseCat),
      ...over,
    });

  const charges = () =>
    txModel.find({ source: 'subscription' }).sort({ date: 1 }).lean();
  const nextDateOf = async (id: Types.ObjectId) =>
    isoDay((await subModel.findById(id).lean())!.nextDate);

  it('charges a due subscription as an expense and moves nextDate forward', async () => {
    const sub = await seed();
    const result = await processor.processDue(new Date('2026-03-15T10:00:00Z'));

    expect(result).toEqual({ charged: 1, failed: [] });
    const [tx] = await charges();
    expect(tx).toMatchObject({
      type: 'expense',
      amountCents: 1500,
      note: 'Netflix',
      source: 'subscription',
    });
    expect(isoDay(tx.date)).toBe('2026-03-15');
    expect(String(tx.accountId)).toBe(A);
    expect(String(tx.categoryId)).toBe(expenseCat);
    expect(String(tx.subscriptionId)).toBe(String(sub._id));
    expect(await balance(A)).toBe(1_000_000 - 1500);
    expect(await nextDateOf(sub._id)).toBe('2026-04-15');
  });

  it('does nothing for subscriptions not yet due or paused', async () => {
    await seed({ nextDate: day('2026-03-16') });
    await seed({ name: 'Pausada', nextDate: day('2026-01-01'), active: false });
    const result = await processor.processDue(new Date('2026-03-15T10:00:00Z'));
    expect(result.charged).toBe(0);
    expect(await charges()).toHaveLength(0);
    expect(await balance(A)).toBe(1_000_000);
  });

  it('catches up every missed charge with its own date', async () => {
    const sub = await seed({ nextDate: day('2026-01-15') });
    const result = await processor.processDue(new Date('2026-04-20T08:00:00Z'));
    expect(result.charged).toBe(4);
    expect((await charges()).map((t) => isoDay(t.date))).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
    expect(await balance(A)).toBe(1_000_000 - 4 * 1500);
    expect(await nextDateOf(sub._id)).toBe('2026-05-15');
  });

  it('catches up weekly charges too', async () => {
    await seed({
      frequency: 'weekly',
      nextDate: day('2026-03-01'),
      anchorDay: 1,
    });
    await processor.processDue(new Date('2026-03-15T08:00:00Z'));
    expect((await charges()).map((t) => isoDay(t.date))).toEqual([
      '2026-03-01',
      '2026-03-08',
      '2026-03-15',
    ]);
  });

  it('keeps the anchor day across short months', async () => {
    await seed({ nextDate: day('2026-01-31'), anchorDay: 31 });
    await processor.processDue(new Date('2026-04-30T08:00:00Z'));
    expect((await charges()).map((t) => isoDay(t.date))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('is idempotent: a second run charges nothing', async () => {
    await seed({ nextDate: day('2026-01-15') });
    const now = new Date('2026-04-20T08:00:00Z');
    await processor.processDue(now);
    const second = await processor.processDue(now);
    expect(second).toEqual({ charged: 0, failed: [] });
    expect(await charges()).toHaveLength(4);
    expect(await balance(A)).toBe(1_000_000 - 4 * 1500);
  });

  it('two simultaneous runs never duplicate a charge', async () => {
    const sub = await seed({ nextDate: day('2026-01-15') });
    const now = new Date('2026-03-20T08:00:00Z'); // Jan, Feb, Mar due
    await Promise.all([processor.processDue(now), processor.processDue(now)]);
    const all = await charges();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((t) => isoDay(t.date))).size).toBe(3);
    expect(await balance(A)).toBe(1_000_000 - 3 * 1500);
    expect(await nextDateOf(sub._id)).toBe('2026-04-15');
  });

  it('charges a credit card payer by raising its debt', async () => {
    await seed({ accountId: undefined, creditCardId: new Types.ObjectId(K) });
    await processor.processDue(new Date('2026-03-15T08:00:00Z'));
    expect((await cardModel.findById(K).lean())!.debtCents).toBe(1500);
    expect(await balance(A)).toBe(1_000_000);
  });

  describe('failures', () => {
    it('leaves nextDate alone, records the error, and recovers on a later run', async () => {
      const sub = await seed();
      await accountModel.updateOne({ _id: A }, { isArchived: true });

      const failed = await processor.processDue(
        new Date('2026-03-15T08:00:00Z'),
      );
      expect(failed.charged).toBe(0);
      expect(failed.failed).toHaveLength(1);
      expect(failed.failed[0]).toMatchObject({
        subscriptionId: String(sub._id),
        name: 'Netflix',
      });
      expect(failed.failed[0].error).toMatch(/archived/i);
      const stored = await subModel.findById(sub._id).lean();
      expect(isoDay(stored!.nextDate)).toBe('2026-03-15');
      expect(stored!.lastError).toMatch(/archived/i);
      expect(stored!.lastErrorAt).toBeInstanceOf(Date);
      expect(await charges()).toHaveLength(0);
      expect(await balance(A)).toBe(1_000_000);

      await accountModel.updateOne({ _id: A }, { isArchived: false });
      const ok = await processor.processDue(new Date('2026-03-16T08:00:00Z'));
      expect(ok.charged).toBe(1);
      const recovered = await subModel.findById(sub._id).lean();
      expect(isoDay(recovered!.nextDate)).toBe('2026-04-15');
      expect(recovered!.lastError).toBeUndefined();
      expect(recovered!.lastErrorAt).toBeUndefined();
    });

    it('keeps the charges already made when a later one fails, then finishes next run', async () => {
      const sub = await seed({ nextDate: day('2026-01-15') });
      const real = transactions.createWithin.bind(transactions);
      jest
        .spyOn(transactions, 'createWithin')
        .mockImplementationOnce(real)
        .mockRejectedValueOnce(new Error('boom'));

      const first = await processor.processDue(
        new Date('2026-03-20T08:00:00Z'),
      );
      expect(first.charged).toBe(1);
      expect(first.failed).toEqual([
        { subscriptionId: String(sub._id), name: 'Netflix', error: 'boom' },
      ]);
      expect(await charges()).toHaveLength(1);
      expect(await balance(A)).toBe(1_000_000 - 1500);
      expect(await nextDateOf(sub._id)).toBe('2026-02-15');
      expect((await subModel.findById(sub._id).lean())!.lastError).toBe('boom');

      const second = await processor.processDue(
        new Date('2026-03-20T08:00:00Z'),
      );
      expect(second.charged).toBe(2);
      expect(await charges()).toHaveLength(3);
      expect(await nextDateOf(sub._id)).toBe('2026-04-15');
    });

    it('a failing subscription does not stop the others', async () => {
      await accountModel.updateOne({ _id: A2 }, { isArchived: true });
      await seed({ name: 'Rota', accountId: new Types.ObjectId(A2) });
      await seed({ name: 'Sana' });
      const result = await processor.processDue(
        new Date('2026-03-15T08:00:00Z'),
      );
      expect(result.charged).toBe(1);
      expect(result.failed.map((f) => f.name)).toEqual(['Rota']);
    });
  });

  it('with a userId it only processes that user subscriptions', async () => {
    await seed({ name: 'Mia' });
    await seed({
      userId: u2,
      name: 'Ajena',
      accountId: new Types.ObjectId(foreignAcc),
      categoryId: new Types.ObjectId(foreignCat),
    });
    const now = new Date('2026-03-15T08:00:00Z');

    const mine = await processor.processDue(now, { userId: String(u1) });
    expect(mine.charged).toBe(1);
    expect((await charges()).map((t) => t.note)).toEqual(['Mia']);

    const everyone = await processor.processDue(now);
    expect(everyone.charged).toBe(1); // only the other user's remained
    expect((await charges()).map((t) => t.note).sort()).toEqual([
      'Ajena',
      'Mia',
    ]);
  });

  it('caps the catch-up of a single run', async () => {
    const sub = await seed({
      frequency: 'weekly',
      nextDate: day('2018-01-01'),
      anchorDay: 1,
      amountCents: 1,
    });
    const result = await processor.processDue(new Date('2026-03-15T08:00:00Z'));
    expect(MAX_CATCH_UP).toBe(366);
    expect(result.charged).toBe(MAX_CATCH_UP);
    expect(await txModel.countDocuments({ source: 'subscription' })).toBe(
      MAX_CATCH_UP,
    );
    // not over: the rest is picked up by the next run
    const remaining = await subModel.findById(sub._id).lean();
    expect(remaining!.nextDate.getTime()).toBeLessThan(
      day('2026-03-16').getTime(),
    );
  });
});
