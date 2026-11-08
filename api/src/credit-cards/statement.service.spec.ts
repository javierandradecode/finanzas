import { NotFoundException } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import {
  InMemoryMongo,
  mongoTestOptions,
  startMongo,
} from '../../test/mongo-memory';
import {
  InstallmentPurchase,
  InstallmentPurchaseSchema,
} from '../installment-purchases/schemas/installment-purchase.schema';
import {
  Transaction,
  TransactionSchema,
} from '../transactions/schemas/transaction.schema';
import { CreditCardsService } from './credit-cards.service';
import { CreditCard, CreditCardSchema } from './schemas/credit-card.schema';
import { StatementService } from './statement.service';

jest.setTimeout(180_000);

const oid = () => new Types.ObjectId();
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

describe('StatementService (integration)', () => {
  let mongo: InMemoryMongo;
  let moduleRef: TestingModule;
  let service: StatementService;
  let cardModel: Model<CreditCard>;
  let txModel: Model<Transaction>;
  let purchaseModel: Model<InstallmentPurchase>;

  const u1 = oid();
  const u2 = oid();
  const accountId = oid();
  const categoryId = oid();
  let K: string;
  let otherCard: string;
  let foreignCard: string;

  beforeAll(async () => {
    mongo = await startMongo();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.uri, mongoTestOptions),
        MongooseModule.forFeature([
          { name: CreditCard.name, schema: CreditCardSchema },
          { name: Transaction.name, schema: TransactionSchema },
          { name: InstallmentPurchase.name, schema: InstallmentPurchaseSchema },
        ]),
      ],
      providers: [CreditCardsService, StatementService],
    }).compile();
    service = moduleRef.get(StatementService);
    cardModel = moduleRef.get(getModelToken(CreditCard.name));
    txModel = moduleRef.get(getModelToken(Transaction.name));
    purchaseModel = moduleRef.get(getModelToken(InstallmentPurchase.name));
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all(
      [cardModel, txModel, purchaseModel].map((m) => m.deleteMany({})),
    );
    const card = (userId: Types.ObjectId, name: string, debtCents = 0) =>
      cardModel
        .create({
          userId,
          name,
          limitCents: 500_000,
          cutoffDay: 15,
          paymentDay: 5,
          debtCents,
        })
        .then((d) => String(d._id));
    K = await card(u1, 'Visa', 115_000);
    otherCard = await card(u1, 'Master');
    foreignCard = await card(u2, 'Ajena');
  });

  const cardExpense = (
    cardId: string,
    date: string,
    amountCents: number,
    userId = u1,
  ) =>
    txModel.create({
      userId,
      type: 'expense',
      amountCents,
      date: new Date(date),
      creditCardId: new Types.ObjectId(cardId),
      categoryId,
    });

  const cardPayment = (cardId: string, date: string, amountCents: number) =>
    txModel.create({
      userId: u1,
      type: 'transfer',
      amountCents,
      date: new Date(date),
      accountId,
      toCreditCardId: new Types.ObjectId(cardId),
    });

  const purchase = (over: Record<string, unknown>) =>
    purchaseModel.create({
      userId: u1,
      creditCardId: new Types.ObjectId(K),
      description: 'Laptop',
      categoryId,
      totalCents: 120_000,
      installments: 12,
      annualRatePercent: 0,
      startDate: day('2026-03-10'),
      firstDueDate: day('2026-04-05'),
      paymentDay: 5,
      paidInstallments: 0,
      purchaseTransactionId: oid(),
      ...over,
    });

  it('builds the statement of the period containing the date', async () => {
    await cardExpense(K, '2026-02-14T10:00:00Z', 700); // previous period
    await cardExpense(K, '2026-03-10T10:00:00Z', 120_000);
    await cardExpense(K, '2026-03-15T20:00:00Z', 2_500); // cutoff day belongs here
    await cardExpense(K, '2026-03-16T00:00:00Z', 900); // next period
    await cardExpense(otherCard, '2026-03-10T10:00:00Z', 5_000); // other card
    await cardExpense(foreignCard, '2026-03-10T10:00:00Z', 6_000, u2); // other user
    await txModel.create({
      userId: u1,
      type: 'expense',
      amountCents: 4_000,
      date: new Date('2026-03-11T10:00:00Z'),
      accountId,
      categoryId,
    }); // paid from an account, not the card
    await cardPayment(K, '2026-03-12T10:00:00Z', 5_000);
    await purchase({});

    const s = await service.build(String(u1), K, day('2026-03-12'));

    expect(isoDay(s.period.start)).toBe('2026-02-16');
    expect(isoDay(s.period.end)).toBe('2026-03-15');
    expect(isoDay(s.paymentDueDate)).toBe('2026-04-05');
    expect(s.purchases.map((t) => t.amountCents)).toEqual([120_000, 2_500]);
    expect(s.payments.map((t) => t.amountCents)).toEqual([5_000]);
    expect(s.installmentsDue).toHaveLength(1);
    expect(s.installmentsDue[0]).toMatchObject({
      description: 'Laptop',
      number: 1,
      of: 12,
      principalCents: 10_000,
      interestCents: 0,
      paymentCents: 10_000,
    });
    expect(isoDay(s.installmentsDue[0].dueDate)).toBe('2026-04-05');
    expect(s.totals).toEqual({
      purchasesCents: 122_500,
      paymentsCents: 5_000,
      installmentsDueCents: 10_000,
    });
    expect(s.debtCents).toBe(115_000);
    expect(s.availableCents).toBe(385_000);
  });

  it('a date after the cutoff day gives the next statement', async () => {
    await cardExpense(K, '2026-03-16T00:00:00Z', 900);
    await purchase({});
    const s = await service.build(String(u1), K, day('2026-03-16'));
    expect(isoDay(s.period.start)).toBe('2026-03-16');
    expect(isoDay(s.period.end)).toBe('2026-04-15');
    expect(isoDay(s.paymentDueDate)).toBe('2026-05-05');
    expect(s.purchases.map((t) => t.amountCents)).toEqual([900]);
    expect(s.installmentsDue.map((i) => i.number)).toEqual([2]);
  });

  it('lists only unpaid installments due in the window, never overdue or paid ones', async () => {
    // 6 installments starting 2026-01-05: due Jan, Feb, Mar, Apr, May, Jun (day 5)
    await purchase({
      description: 'Viejo',
      totalCents: 60_000,
      installments: 6,
      firstDueDate: day('2026-01-05'),
      paidInstallments: 0,
    });
    await purchase({
      description: 'Pagado',
      totalCents: 60_000,
      installments: 6,
      firstDueDate: day('2026-01-05'),
      paidInstallments: 4,
    });
    const s = await service.build(String(u1), K, day('2026-03-12'));
    const viejo = s.installmentsDue.filter((i) => i.description === 'Viejo');
    expect(viejo.map((i) => i.number)).toEqual([4]); // Jan-Mar are overdue, not listed
    expect(isoDay(viejo[0].dueDate)).toBe('2026-04-05');
    expect(s.installmentsDue.some((i) => i.description === 'Pagado')).toBe(
      false,
    );
  });

  it("another user's card is 404", async () => {
    await expect(
      service.build(String(u1), foreignCard, day('2026-03-12')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
