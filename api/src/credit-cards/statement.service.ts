import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { buildSchedule } from '../installment-purchases/installment-schedule';
import { InstallmentPurchase } from '../installment-purchases/schemas/installment-purchase.schema';
import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';
import {
  monthlyDueDates,
  paymentDateFor,
  statementPeriodFor,
} from './billing-dates';
import { CreditCardsService } from './credit-cards.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DueInstallment {
  purchaseId: string;
  description: string;
  number: number;
  of: number;
  dueDate: Date;
  principalCents: number;
  interestCents: number;
  paymentCents: number;
}

export interface Statement {
  cardId: string;
  period: { start: Date; end: Date };
  paymentDueDate: Date;
  /** Expenses charged to the card during the period (includes installment purchases). */
  purchases: TransactionDocument[];
  /** Payments made to the card during the period. */
  payments: TransactionDocument[];
  /** Unpaid installments due after the period closes, up to the payment date. */
  installmentsDue: DueInstallment[];
  totals: {
    purchasesCents: number;
    paymentsCents: number;
    installmentsDueCents: number;
  };
  /** Current debt and available credit (not as of the period end). */
  debtCents: number;
  availableCents: number;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

@Injectable()
export class StatementService {
  constructor(
    private readonly cards: CreditCardsService,
    @InjectModel(Transaction.name) private readonly txModel: Model<Transaction>,
    @InjectModel(InstallmentPurchase.name)
    private readonly purchaseModel: Model<InstallmentPurchase>,
  ) {}

  /** Statement of the period that contains `date`. */
  async build(userId: string, cardId: string, date: Date): Promise<Statement> {
    const card = await this.cards.findOne(userId, cardId);
    const period = statementPeriodFor(date, card.cutoffDay);
    const paymentDueDate = paymentDateFor(period.end, card.paymentDay);
    const owner = new Types.ObjectId(userId);
    // `end` is a day at 00:00 UTC and the cutoff day belongs to the period.
    const inPeriod = {
      $gte: period.start,
      $lt: new Date(period.end.getTime() + DAY_MS),
    };

    const [purchases, payments, installmentPurchases] = await Promise.all([
      this.txModel
        .find({
          userId: owner,
          type: 'expense',
          creditCardId: card._id,
          date: inPeriod,
        })
        .sort({ date: 1, _id: 1 })
        .exec(),
      this.txModel
        .find({
          userId: owner,
          type: 'transfer',
          toCreditCardId: card._id,
          date: inPeriod,
        })
        .sort({ date: 1, _id: 1 })
        .exec(),
      this.purchaseModel.find({ userId: owner, creditCardId: card._id }).exec(),
    ]);

    const installmentsDue: DueInstallment[] = [];
    for (const purchase of installmentPurchases) {
      const schedule = buildSchedule({
        totalCents: purchase.totalCents,
        installments: purchase.installments,
        annualRatePercent: purchase.annualRatePercent,
        dueDates: monthlyDueDates(
          purchase.firstDueDate,
          purchase.paymentDay,
          purchase.installments,
        ),
      });
      schedule.forEach((item, index) => {
        const unpaid = index >= purchase.paidInstallments;
        const inWindow =
          item.dueDate.getTime() > period.end.getTime() &&
          item.dueDate.getTime() <= paymentDueDate.getTime();
        if (unpaid && inWindow) {
          installmentsDue.push({
            purchaseId: String(purchase._id),
            description: purchase.description,
            number: item.number,
            of: purchase.installments,
            dueDate: item.dueDate,
            principalCents: item.principalCents,
            interestCents: item.interestCents,
            paymentCents: item.paymentCents,
          });
        }
      });
    }

    return {
      cardId: String(card._id),
      period,
      paymentDueDate,
      purchases,
      payments,
      installmentsDue,
      totals: {
        purchasesCents: sum(purchases.map((t) => t.amountCents)),
        paymentsCents: sum(payments.map((t) => t.amountCents)),
        installmentsDueCents: sum(installmentsDue.map((i) => i.paymentCents)),
      },
      debtCents: card.debtCents,
      availableCents: card.limitCents - card.debtCents,
    };
  }
}
