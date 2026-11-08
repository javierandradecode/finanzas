import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, QueryFilter, Model, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { definedOnly } from '../common/utils/defined-only';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQuery, Page } from './dto/list-transactions.query';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { netEffects } from './transaction-effects';
import { assertValidShape, TxShape } from './transaction-shape';

const oid = (id: string) => new Types.ObjectId(id);

/** A date-only `to` ("2026-03-31") means the end of that day in UTC. */
const endOfRange = (to: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(to)
    ? new Date(`${to}T23:59:59.999Z`)
    : new Date(to);
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

  async findAll(
    userId: string,
    q: ListTransactionsQuery,
  ): Promise<Page<TransactionDocument>> {
    const filter: QueryFilter<Transaction> = { userId: oid(userId) };
    if (q.type) filter.type = q.type;
    if (q.categoryId) filter.categoryId = oid(q.categoryId);
    if (q.accountId) {
      filter.$or = [
        { accountId: oid(q.accountId) },
        { toAccountId: oid(q.accountId) },
      ];
    }
    if (q.from || q.to) {
      filter.date = {};
      if (q.from) filter.date.$gte = new Date(q.from);
      if (q.to) filter.date.$lte = endOfRange(q.to);
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ date: -1, _id: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total, page: q.page, limit: q.limit };
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

  /**
   * Edits any field. The previous state is read inside the transaction, so a
   * concurrent edit conflicts and is retried instead of corrupting balances.
   * Balances move by (effect of new state) - (effect of old state).
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionDocument> {
    return this.connection.transaction(async (session) => {
      const doc = await this.loadForUpdate(userId, id, session);
      const before = shapeOf(doc);
      const patch = definedOnly(dto);

      const after: TxShape = { ...before };
      if (patch.type !== undefined) after.type = patch.type;
      if (patch.amountCents !== undefined)
        after.amountCents = patch.amountCents;
      if (patch.accountId !== undefined) after.accountId = patch.accountId;
      if (patch.toAccountId !== undefined)
        after.toAccountId = patch.toAccountId;
      if (patch.categoryId !== undefined) after.categoryId = patch.categoryId;
      if (patch.subcategoryId !== undefined) {
        after.subcategoryId = patch.subcategoryId;
      } else if (
        patch.categoryId !== undefined &&
        patch.categoryId !== before.categoryId
      ) {
        after.subcategoryId = null; // the old subcategory belongs to the old category
      }

      assertValidShape(after);
      await this.assertReferences(userId, after, before);

      doc.set({
        type: after.type,
        amountCents: after.amountCents,
        accountId: oid(after.accountId),
        toAccountId: after.toAccountId ? oid(after.toAccountId) : undefined,
        categoryId: after.categoryId ? oid(after.categoryId) : undefined,
        subcategoryId: after.subcategoryId
          ? oid(after.subcategoryId)
          : undefined,
        ...(patch.date !== undefined && { date: patch.date }),
        ...(patch.note !== undefined && { note: patch.note ?? undefined }),
      });
      await doc.save({ session });
      await this.accounts.applyDeltas(
        userId,
        netEffects(before, after),
        session,
      );
      return doc;
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.connection.transaction(async (session) => {
      const doc = await this.loadForUpdate(userId, id, session);
      await this.model.deleteOne(
        { _id: doc._id, userId: oid(userId) },
        { session },
      );
      await this.accounts.applyDeltas(
        userId,
        netEffects(shapeOf(doc), null),
        session,
      );
    });
  }

  private async loadForUpdate(
    userId: string,
    id: string,
    session: ClientSession,
  ): Promise<TransactionDocument> {
    const doc = await this.model
      .findOne({ _id: oid(id), userId: oid(userId) })
      .session(session)
      .exec();
    if (!doc) throw new NotFoundException('Transaction not found');
    return doc;
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
