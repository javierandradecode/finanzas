import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { definedOnly } from '../common/utils/defined-only';
import type { AccountDeltas } from '../transactions/transaction-effects';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { CreditCard, CreditCardDocument } from './schemas/credit-card.schema';

const CASE_INSENSITIVE = { locale: 'es', strength: 2 } as const;

@Injectable()
export class CreditCardsService {
  constructor(
    @InjectModel(CreditCard.name) private readonly model: Model<CreditCard>,
  ) {}

  findAll(
    userId: string,
    includeArchived = false,
  ): Promise<CreditCardDocument[]> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (!includeArchived) filter.isArchived = false;
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  async findOne(userId: string, id: string): Promise<CreditCardDocument> {
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Credit card not found');
    return doc;
  }

  async create(
    userId: string,
    dto: CreateCreditCardDto,
  ): Promise<CreditCardDocument> {
    await this.assertNameFree(userId, dto.name);
    return this.model.create({
      userId: new Types.ObjectId(userId),
      name: dto.name,
      limitCents: dto.limitCents,
      cutoffDay: dto.cutoffDay,
      paymentDay: dto.paymentDay,
      annualRatePercent: dto.annualRatePercent ?? 0,
      debtCents: dto.initialDebtCents ?? 0,
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCreditCardDto,
  ): Promise<CreditCardDocument> {
    const doc = await this.findOne(userId, id);
    const willBeActive = !(dto.isArchived ?? doc.isArchived);
    const identityChanges =
      dto.name !== undefined || (doc.isArchived && dto.isArchived === false);
    if (willBeActive && identityChanges) {
      await this.assertNameFree(userId, dto.name ?? doc.name, doc._id);
    }
    Object.assign(doc, definedOnly(dto));
    await doc.save();
    return doc;
  }

  async archive(userId: string, id: string): Promise<void> {
    const doc = await this.findOne(userId, id);
    doc.isArchived = true;
    await doc.save();
  }

  /**
   * Adds each delta to its card's debt with an atomic `$inc`, inside the
   * caller's transaction (same approach as account balances).
   */
  async applyDebtDeltas(
    userId: string,
    deltas: AccountDeltas,
    session: ClientSession,
  ): Promise<void> {
    if (deltas.size === 0) return;
    const owner = new Types.ObjectId(userId);
    const ops = [...deltas].map(([cardId, cents]) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(cardId), userId: owner },
        update: { $inc: { debtCents: cents } },
      },
    }));
    const result = await this.model.bulkWrite(ops, { session });
    if (result.matchedCount !== ops.length) {
      throw new NotFoundException('Credit card not found');
    }
  }

  private async assertNameFree(
    userId: string,
    name: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      name,
      isArchived: false,
    };
    if (excludeId) filter._id = { $ne: excludeId };
    const dup = await this.model
      .findOne(filter)
      .collation(CASE_INSENSITIVE)
      .exec();
    if (dup) throw new ConflictException('Credit card name already in use');
  }
}
