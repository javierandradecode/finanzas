import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { definedOnly } from '../common/utils/defined-only';
import { TransactionsService } from '../transactions/transactions.service';
import { assertValidShape, TxShape } from '../transactions/transaction-shape';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import {
  Frequency,
  firstOnOrAfter,
  occurrencesUntil,
  startOfUtcDay,
} from './recurrence';
import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

const oid = (id: string) => new Types.ObjectId(id);
const optOid = (id?: string | null) => (id ? oid(id) : undefined);
const str = (id?: Types.ObjectId | string | null) => (id ? String(id) : null);

export interface UpcomingCharge {
  subscriptionId: string;
  name: string;
  amountCents: number;
  date: Date;
  /** Past its date and not yet charged. */
  overdue: boolean;
  frequency: Frequency;
  accountId?: string;
  creditCardId?: string;
  categoryId: string;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name) private readonly model: Model<Subscription>,
    private readonly transactions: TransactionsService,
  ) {}

  findAll(userId: string): Promise<SubscriptionDocument[]> {
    return this.model
      .find({ userId: oid(userId) })
      .sort({ name: 1, _id: 1 })
      .exec();
  }

  async findOne(userId: string, id: string): Promise<SubscriptionDocument> {
    const doc = await this.model
      .findOne({ _id: oid(id), userId: oid(userId) })
      .exec();
    if (!doc) throw new NotFoundException('Subscription not found');
    return doc;
  }

  async create(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<SubscriptionDocument> {
    await this.assertCanCharge(
      userId,
      {
        type: 'expense',
        amountCents: dto.amountCents,
        accountId: dto.accountId,
        creditCardId: dto.creditCardId,
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId,
      },
      null,
    );
    const nextDate = startOfUtcDay(dto.nextDate);
    return this.model.create({
      userId: oid(userId),
      name: dto.name,
      amountCents: dto.amountCents,
      frequency: dto.frequency,
      nextDate,
      anchorDay: nextDate.getUTCDate(),
      accountId: optOid(dto.accountId),
      creditCardId: optOid(dto.creditCardId),
      categoryId: oid(dto.categoryId),
      subcategoryId: optOid(dto.subcategoryId),
    });
  }

  /**
   * Edits any field. Reactivating a paused subscription moves a past
   * `nextDate` to the first occurrence from today, so the paused period is
   * never charged retroactively.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateSubscriptionDto,
    now: Date = new Date(),
  ): Promise<SubscriptionDocument> {
    const doc = await this.findOne(userId, id);
    const patch = definedOnly(dto);
    const before = this.shapeOf(doc);

    const after: TxShape = { ...before };
    if (patch.amountCents !== undefined) after.amountCents = patch.amountCents;
    if (patch.accountId !== undefined) after.accountId = patch.accountId;
    if (patch.creditCardId !== undefined)
      after.creditCardId = patch.creditCardId;
    if (patch.categoryId !== undefined) after.categoryId = patch.categoryId;
    if (patch.subcategoryId !== undefined) {
      after.subcategoryId = patch.subcategoryId;
    } else if (
      patch.categoryId !== undefined &&
      patch.categoryId !== before.categoryId
    ) {
      after.subcategoryId = null; // the old subcategory belongs to the old category
    }
    await this.assertCanCharge(userId, after, before);

    if (patch.name !== undefined) doc.name = patch.name;
    if (patch.frequency !== undefined) doc.frequency = patch.frequency;
    doc.amountCents = after.amountCents;
    doc.accountId = optOid(after.accountId);
    doc.creditCardId = optOid(after.creditCardId);
    doc.categoryId = oid(after.categoryId as string);
    doc.subcategoryId = optOid(after.subcategoryId);
    if (patch.nextDate !== undefined) {
      doc.nextDate = startOfUtcDay(patch.nextDate);
      doc.anchorDay = doc.nextDate.getUTCDate();
    }

    if (patch.active !== undefined) {
      const reactivating = patch.active && !doc.active;
      doc.active = patch.active;
      if (reactivating) {
        doc.nextDate = firstOnOrAfter(
          startOfUtcDay(now),
          doc.nextDate,
          doc.frequency,
          doc.anchorDay,
        );
        doc.lastError = undefined;
        doc.lastErrorAt = undefined;
      }
    }
    await doc.save();
    return doc;
  }

  /** "Deleting" a subscription pauses it; its generated charges stay. */
  async pause(userId: string, id: string): Promise<void> {
    const doc = await this.findOne(userId, id);
    doc.active = false;
    await doc.save();
  }

  /** Every charge due from each active subscription's `nextDate` up to `days` ahead. */
  async upcoming(
    userId: string,
    days: number,
    now: Date = new Date(),
  ): Promise<UpcomingCharge[]> {
    const today = startOfUtcDay(now);
    const until = new Date(today.getTime() + days * DAY_MS);
    const subs = await this.model
      .find({ userId: oid(userId), active: true })
      .exec();

    const charges = subs.flatMap((sub) =>
      occurrencesUntil(sub.nextDate, until, sub.frequency, sub.anchorDay).map(
        (date): UpcomingCharge => ({
          subscriptionId: String(sub._id),
          name: sub.name,
          amountCents: sub.amountCents,
          date,
          overdue: date.getTime() < today.getTime(),
          frequency: sub.frequency,
          accountId: sub.accountId ? String(sub.accountId) : undefined,
          creditCardId: sub.creditCardId ? String(sub.creditCardId) : undefined,
          categoryId: String(sub.categoryId),
        }),
      ),
    );
    return charges.sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name),
    );
  }

  /** The charge is an expense, so it must be a valid expense on active, owned references. */
  private async assertCanCharge(
    userId: string,
    after: TxShape,
    before: TxShape | null,
  ): Promise<void> {
    assertValidShape(after);
    await this.transactions.assertReferences(userId, after, before);
  }

  private shapeOf(doc: SubscriptionDocument): TxShape {
    return {
      type: 'expense',
      amountCents: doc.amountCents,
      accountId: str(doc.accountId),
      creditCardId: str(doc.creditCardId),
      categoryId: str(doc.categoryId),
      subcategoryId: str(doc.subcategoryId),
    };
  }
}
