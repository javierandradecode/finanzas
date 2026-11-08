import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { CategoriesService } from '../categories/categories.service';
import { definedOnly } from '../common/utils/defined-only';
import {
  monthlyDueDates,
  paymentDateFor,
  statementPeriodFor,
} from '../credit-cards/billing-dates';
import { CreditCardsService } from '../credit-cards/credit-cards.service';
import { Transaction } from '../transactions/schemas/transaction.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateInstallmentPurchaseDto } from './dto/create-installment-purchase.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { UpdateInstallmentPurchaseDto } from './dto/update-installment-purchase.dto';
import { buildSchedule, ScheduleItem } from './installment-schedule';
import {
  InstallmentPurchase,
  InstallmentPurchaseDocument,
} from './schemas/installment-purchase.schema';

const oid = (id: string) => new Types.ObjectId(id);

export type ScheduleView = ScheduleItem & { paid: boolean };

/** A purchase as returned by the API: stored fields plus the computed schedule. */
export interface InstallmentPurchaseView {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  creditCardId: Types.ObjectId;
  description: string;
  categoryId: Types.ObjectId;
  subcategoryId?: Types.ObjectId;
  totalCents: number;
  installments: number;
  annualRatePercent: number;
  startDate: Date;
  firstDueDate: Date;
  paymentDay: number;
  paidInstallments: number;
  purchaseTransactionId: Types.ObjectId;
  schedule: ScheduleView[];
  isPaidOff: boolean;
}

@Injectable()
export class InstallmentPurchasesService {
  constructor(
    @InjectModel(InstallmentPurchase.name)
    private readonly model: Model<InstallmentPurchase>,
    @InjectModel(Transaction.name)
    private readonly txModel: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private readonly cards: CreditCardsService,
    private readonly categories: CategoriesService,
    private readonly transactions: TransactionsService,
  ) {}

  /**
   * Records the purchase and charges the whole amount to the card right away
   * (the debt uses the credit limit from day one). One MongoDB transaction.
   */
  async create(
    userId: string,
    dto: CreateInstallmentPurchaseDto,
  ): Promise<InstallmentPurchaseView> {
    if (dto.totalCents < dto.installments) {
      throw new BadRequestException(
        'totalCents must be at least one cent per installment',
      );
    }
    const card = await this.cards.findOne(userId, dto.creditCardId);
    const period = statementPeriodFor(dto.startDate, card.cutoffDay);
    const firstDueDate = paymentDateFor(period.end, card.paymentDay);
    const rate = dto.annualRatePercent ?? 0;

    try {
      // Dry run so an impossible plan is a 400, not a 500 halfway through.
      buildSchedule({
        totalCents: dto.totalCents,
        installments: dto.installments,
        annualRatePercent: rate,
        dueDates: monthlyDueDates(
          firstDueDate,
          card.paymentDay,
          dto.installments,
        ),
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const purchaseId = new Types.ObjectId();
    const doc = await this.connection.transaction(async (session) => {
      const expense = await this.transactions.createWithin(session, userId, {
        type: 'expense',
        amountCents: dto.totalCents,
        date: dto.startDate,
        creditCardId: dto.creditCardId,
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId,
        note: dto.description,
        source: 'installment',
        installmentPurchaseId: String(purchaseId),
      });
      const [created] = await this.model.create(
        [
          {
            _id: purchaseId,
            userId: oid(userId),
            creditCardId: oid(dto.creditCardId),
            description: dto.description,
            categoryId: oid(dto.categoryId),
            subcategoryId: dto.subcategoryId
              ? oid(dto.subcategoryId)
              : undefined,
            totalCents: dto.totalCents,
            installments: dto.installments,
            annualRatePercent: rate,
            startDate: dto.startDate,
            firstDueDate,
            paymentDay: card.paymentDay,
            purchaseTransactionId: expense._id,
          },
        ],
        { session },
      );
      return created;
    });
    return this.view(doc);
  }

  async findAll(
    userId: string,
    opts: { creditCardId?: string },
  ): Promise<InstallmentPurchaseView[]> {
    const filter: Record<string, unknown> = { userId: oid(userId) };
    if (opts.creditCardId) filter.creditCardId = oid(opts.creditCardId);
    const docs = await this.model
      .find(filter)
      .sort({ startDate: -1, _id: -1 })
      .exec();
    return docs.map((d) => this.view(d));
  }

  async findOne(userId: string, id: string): Promise<InstallmentPurchaseView> {
    return this.view(await this.load(userId, id));
  }

  /** Only description, category and subcategory change; money never does. */
  async update(
    userId: string,
    id: string,
    dto: UpdateInstallmentPurchaseDto,
  ): Promise<InstallmentPurchaseView> {
    const patch = definedOnly(dto);
    return this.connection.transaction(async (session) => {
      const doc = await this.load(userId, id, session);
      const set: Record<string, unknown> = {};
      const unset: Record<string, ''> = {};

      if (patch.description !== undefined) {
        doc.description = patch.description;
        set.note = patch.description;
      }

      if (patch.categoryId !== undefined || patch.subcategoryId !== undefined) {
        const categoryId = patch.categoryId ?? String(doc.categoryId);
        const subcategoryId =
          patch.categoryId !== undefined
            ? (patch.subcategoryId ?? null)
            : patch.subcategoryId;
        const category = await this.categories.findOne(userId, categoryId);
        if (category.type !== 'expense') {
          throw new BadRequestException('Category must be an expense category');
        }
        if (category.isArchived && categoryId !== String(doc.categoryId)) {
          throw new ConflictException('Category is archived');
        }
        if (subcategoryId) {
          const sub = category.subcategories.find(
            (s) => String(s._id) === subcategoryId,
          );
          if (!sub) {
            throw new BadRequestException(
              'Subcategory does not belong to category',
            );
          }
          if (sub.isArchived && subcategoryId !== String(doc.subcategoryId)) {
            throw new ConflictException('Subcategory is archived');
          }
        }
        doc.categoryId = oid(categoryId);
        set.categoryId = oid(categoryId);
        if (subcategoryId) {
          doc.subcategoryId = oid(subcategoryId);
          set.subcategoryId = oid(subcategoryId);
        } else {
          doc.subcategoryId = undefined;
          unset.subcategoryId = '';
        }
      }

      await doc.save({ session });
      const txUpdate: Record<string, unknown> = {};
      if (Object.keys(set).length) txUpdate.$set = set;
      if (Object.keys(unset).length) txUpdate.$unset = unset;
      if (Object.keys(txUpdate).length) {
        await this.txModel.updateOne(
          { _id: doc.purchaseTransactionId, userId: oid(userId) },
          txUpdate,
          { session },
        );
      }
      return this.view(doc);
    });
  }

  /** Deletes a purchase that has no payments yet and reverts its debt. */
  async remove(userId: string, id: string): Promise<void> {
    await this.connection.transaction(async (session) => {
      const doc = await this.load(userId, id, session);
      if (doc.paidInstallments > 0) {
        throw new ConflictException(
          'A purchase with paid installments cannot be deleted',
        );
      }
      await this.transactions.removeWithin(
        session,
        userId,
        String(doc.purchaseTransactionId),
      );
      await this.model.deleteOne(
        { _id: doc._id, userId: oid(userId) },
        { session },
      );
    });
  }

  /**
   * Pays the next installment from `dto.accountId`: capital goes to the card
   * (lowering the debt), interest is an expense on the account.
   *
   * The count of paid installments is read BEFORE the transaction and used as
   * a condition of the update. Two simultaneous calls therefore both aim at the
   * same installment; the loser conflicts (and its retry fails the condition)
   * instead of silently paying the following one.
   */
  async payNext(
    userId: string,
    id: string,
    dto: PayInstallmentDto,
  ): Promise<InstallmentPurchaseView> {
    const snapshot = await this.load(userId, id);
    const alreadyPaid = snapshot.paidInstallments;
    if (alreadyPaid >= snapshot.installments) {
      throw new ConflictException('All installments are already paid');
    }
    const item = this.scheduleOf(snapshot)[alreadyPaid];
    const date = dto.date ?? new Date();

    const updated = await this.connection.transaction(async (session) => {
      const claimed = await this.model
        .findOneAndUpdate(
          {
            _id: snapshot._id,
            userId: oid(userId),
            paidInstallments: alreadyPaid,
          },
          { $inc: { paidInstallments: 1 } },
          { session, returnDocument: 'after' },
        )
        .exec();
      if (!claimed) {
        throw new ConflictException('This installment was already paid');
      }

      const label = `${snapshot.description} — cuota ${item.number}/${snapshot.installments}`;
      await this.transactions.createWithin(session, userId, {
        type: 'transfer',
        amountCents: item.principalCents,
        date,
        accountId: dto.accountId,
        toCreditCardId: String(snapshot.creditCardId),
        note: label,
        source: 'installment',
        installmentPurchaseId: String(snapshot._id),
      });
      if (item.interestCents > 0) {
        await this.transactions.createWithin(session, userId, {
          type: 'expense',
          amountCents: item.interestCents,
          date,
          accountId: dto.accountId,
          categoryId: String(snapshot.categoryId),
          subcategoryId: snapshot.subcategoryId
            ? String(snapshot.subcategoryId)
            : undefined,
          note: `Interés: ${label}`,
          source: 'installment',
          installmentPurchaseId: String(snapshot._id),
        });
      }
      return claimed;
    });
    return this.view(updated);
  }

  private async load(
    userId: string,
    id: string,
    session?: ClientSession,
  ): Promise<InstallmentPurchaseDocument> {
    const doc = await this.model
      .findOne({ _id: oid(id), userId: oid(userId) })
      .session(session ?? null)
      .exec();
    if (!doc) throw new NotFoundException('Installment purchase not found');
    return doc;
  }

  private scheduleOf(doc: InstallmentPurchaseDocument): ScheduleItem[] {
    return buildSchedule({
      totalCents: doc.totalCents,
      installments: doc.installments,
      annualRatePercent: doc.annualRatePercent,
      dueDates: monthlyDueDates(
        doc.firstDueDate,
        doc.paymentDay,
        doc.installments,
      ),
    });
  }

  private view(doc: InstallmentPurchaseDocument): InstallmentPurchaseView {
    return {
      _id: doc._id,
      userId: doc.userId,
      creditCardId: doc.creditCardId,
      description: doc.description,
      categoryId: doc.categoryId,
      subcategoryId: doc.subcategoryId,
      totalCents: doc.totalCents,
      installments: doc.installments,
      annualRatePercent: doc.annualRatePercent,
      startDate: doc.startDate,
      firstDueDate: doc.firstDueDate,
      paymentDay: doc.paymentDay,
      paidInstallments: doc.paidInstallments,
      purchaseTransactionId: doc.purchaseTransactionId,
      schedule: this.scheduleOf(doc).map((item, i) => ({
        ...item,
        paid: i < doc.paidInstallments,
      })),
      isPaidOff: doc.paidInstallments >= doc.installments,
    };
  }
}
