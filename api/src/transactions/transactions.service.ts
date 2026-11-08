import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { netEffects, TxFinancials } from './transaction-effects';
import { assertValidShape, TxShape } from './transaction-shape';

const oid = (id: string) => new Types.ObjectId(id);
const str = (id?: Types.ObjectId | string | null) => (id ? String(id) : null);

/** The fields of a transaction that decide its shape and its financial effect. */
function shapeOf(doc: {
  type: TxShape['type'];
  amountCents: number;
  accountId: Types.ObjectId | string;
  toAccountId?: Types.ObjectId | string | null;
  categoryId?: Types.ObjectId | string | null;
  subcategoryId?: Types.ObjectId | string | null;
}): TxShape {
  return {
    type: doc.type,
    amountCents: doc.amountCents,
    accountId: String(doc.accountId),
    toAccountId: str(doc.toAccountId),
    categoryId: str(doc.categoryId),
    subcategoryId: str(doc.subcategoryId),
  };
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private readonly model: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
  ) {}

  async findOne(userId: string, id: string): Promise<TransactionDocument> {
    const doc = await this.model
      .findOne({ _id: oid(id), userId: oid(userId) })
      .exec();
    if (!doc) throw new NotFoundException('Transaction not found');
    return doc;
  }

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionDocument> {
    const after = shapeOf(dto);
    assertValidShape(after);
    await this.assertReferences(userId, after, null);

    return this.connection.transaction(async (session) => {
      const [doc] = await this.model.create(
        [
          {
            userId: oid(userId),
            type: dto.type,
            amountCents: dto.amountCents,
            date: dto.date,
            accountId: oid(dto.accountId),
            toAccountId: dto.toAccountId ? oid(dto.toAccountId) : undefined,
            categoryId: dto.categoryId ? oid(dto.categoryId) : undefined,
            subcategoryId: dto.subcategoryId
              ? oid(dto.subcategoryId)
              : undefined,
            note: dto.note,
          },
        ],
        { session },
      );
      await this.accounts.applyDeltas(userId, netEffects(null, after), session);
      return doc;
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const doc = await this.findOne(userId, id);
    const before: TxFinancials = shapeOf(doc);
    await this.connection.transaction(async (session) => {
      await this.model.deleteOne(
        { _id: doc._id, userId: oid(userId) },
        { session },
      );
      await this.accounts.applyDeltas(
        userId,
        netEffects(before, null),
        session,
      );
    });
  }

  /**
   * Checks that everything the transaction points to exists and is usable.
   * References the transaction already had (`before`) are not re-checked for
   * being active, so old transactions stay editable after archiving.
   */
  private async assertReferences(
    userId: string,
    after: TxShape,
    before: TxShape | null,
  ): Promise<void> {
    const hadAccounts = new Set([before?.accountId, before?.toAccountId]);
    for (const accountId of [after.accountId, after.toAccountId]) {
      if (!accountId) continue;
      const account = await this.accounts.findOne(userId, accountId);
      if (account.isArchived && !hadAccounts.has(accountId)) {
        throw new ConflictException('Account is archived');
      }
    }

    if (!after.categoryId) return;
    const category = await this.categories.findOne(userId, after.categoryId);
    if (category.type !== after.type) {
      throw new BadRequestException('Category type does not match');
    }
    if (category.isArchived && before?.categoryId !== after.categoryId) {
      throw new ConflictException('Category is archived');
    }
    if (after.subcategoryId) {
      const sub = category.subcategories.find(
        (s) => String(s._id) === after.subcategoryId,
      );
      if (!sub) {
        throw new BadRequestException(
          'Subcategory does not belong to category',
        );
      }
      if (sub.isArchived && before?.subcategoryId !== after.subcategoryId) {
        throw new ConflictException('Subcategory is archived');
      }
    }
  }
}
