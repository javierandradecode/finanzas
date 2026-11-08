import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, QueryFilter, Types } from 'mongoose';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { endOfRange } from '../common/utils/date-range';
import { definedOnly } from '../common/utils/defined-only';
import { CreditCardsService } from '../credit-cards/credit-cards.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQuery, Page } from './dto/list-transactions.query';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  Transaction,
  TransactionDocument,
  TxSource,
} from './schemas/transaction.schema';
import { Effects, netEffects } from './transaction-effects';
import { assertValidShape, TxShape } from './transaction-shape';

/** What `createWithin` accepts: the public DTO plus fields only internal flows set. */
export type CreateTransactionInput = CreateTransactionDto & {
  source?: TxSource;
  installmentPurchaseId?: string;
  subscriptionId?: string;
};

type Ref = Types.ObjectId | string | null | undefined;

const oid = (id: string) => new Types.ObjectId(id);
const optOid = (id?: string | null) => (id ? oid(id) : undefined);
const str = (id: Ref) => (id ? String(id) : null);

/** The fields of a transaction that decide its shape and its financial effect. */
function shapeOf(doc: {
  type: TxShape['type'];
  amountCents: number;
  accountId?: Ref;
  toAccountId?: Ref;
  creditCardId?: Ref;
  toCreditCardId?: Ref;
  categoryId?: Ref;
  subcategoryId?: Ref;
}): TxShape {
  return {
    type: doc.type,
    amountCents: doc.amountCents,
    accountId: str(doc.accountId),
    toAccountId: str(doc.toAccountId),
    creditCardId: str(doc.creditCardId),
    toCreditCardId: str(doc.toCreditCardId),
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
    private readonly cards: CreditCardsService,
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

  create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionDocument> {
    return this.connection.transaction((session) =>
      this.createWithin(session, userId, dto),
    );
  }

  /**
   * Creates a transaction and applies its effect on balances/debts inside the
   * caller's transaction (MongoDB does not nest transactions, so flows that
   * create several documents pass their own session).
   */
  async createWithin(
    session: ClientSession,
    userId: string,
    input: CreateTransactionInput,
  ): Promise<TransactionDocument> {
    const after = shapeOf(input);
    assertValidShape(after);
    await this.assertReferences(userId, after, null);

    const [doc] = await this.model.create(
      [
        {
          userId: oid(userId),
          type: input.type,
          amountCents: input.amountCents,
          date: input.date,
          accountId: optOid(input.accountId),
          toAccountId: optOid(input.toAccountId),
          creditCardId: optOid(input.creditCardId),
          toCreditCardId: optOid(input.toCreditCardId),
          categoryId: optOid(input.categoryId),
          subcategoryId: optOid(input.subcategoryId),
          note: input.note,
          source: input.source,
          installmentPurchaseId: optOid(input.installmentPurchaseId),
          subscriptionId: optOid(input.subscriptionId),
        },
      ],
      { session },
    );
    await this.applyEffects(userId, netEffects(null, after), session);
    return doc;
  }

  /**
   * Edits any field. The previous state is read inside the transaction, so a
   * concurrent edit conflicts and is retried instead of corrupting balances.
   * Balances and debts move by (effect of new state) - (effect of old state).
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionDocument> {
    return this.connection.transaction(async (session) => {
      const doc = await this.loadForUpdate(userId, id, session);
      this.assertNotManaged(doc);
      const before = shapeOf(doc);
      const patch = definedOnly(dto);

      const after: TxShape = { ...before };
      if (patch.type !== undefined) after.type = patch.type;
      if (patch.amountCents !== undefined)
        after.amountCents = patch.amountCents;
      if (patch.accountId !== undefined) after.accountId = patch.accountId;
      if (patch.toAccountId !== undefined)
        after.toAccountId = patch.toAccountId;
      if (patch.creditCardId !== undefined)
        after.creditCardId = patch.creditCardId;
      if (patch.toCreditCardId !== undefined)
        after.toCreditCardId = patch.toCreditCardId;
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
        accountId: optOid(after.accountId),
        toAccountId: optOid(after.toAccountId),
        creditCardId: optOid(after.creditCardId),
        toCreditCardId: optOid(after.toCreditCardId),
        categoryId: optOid(after.categoryId),
        subcategoryId: optOid(after.subcategoryId),
        ...(patch.date !== undefined && { date: patch.date }),
        ...(patch.note !== undefined && { note: patch.note ?? undefined }),
      });
      await doc.save({ session });
      await this.applyEffects(userId, netEffects(before, after), session);
      return doc;
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.connection.transaction(async (session) => {
      const doc = await this.loadForUpdate(userId, id, session);
      this.assertNotManaged(doc);
      await this.deleteAndRevert(userId, doc, session);
    });
  }

  /** Deletes any transaction (including managed ones) inside the caller's transaction. */
  async removeWithin(
    session: ClientSession,
    userId: string,
    id: string,
  ): Promise<void> {
    const doc = await this.loadForUpdate(userId, id, session);
    await this.deleteAndRevert(userId, doc, session);
  }

  private async deleteAndRevert(
    userId: string,
    doc: TransactionDocument,
    session: ClientSession,
  ): Promise<void> {
    await this.model.deleteOne(
      { _id: doc._id, userId: oid(userId) },
      { session },
    );
    await this.applyEffects(userId, netEffects(shapeOf(doc), null), session);
  }

  private async applyEffects(
    userId: string,
    effects: Effects,
    session: ClientSession,
  ): Promise<void> {
    await this.accounts.applyDeltas(userId, effects.accounts, session);
    await this.cards.applyDebtDeltas(userId, effects.cards, session);
  }

  private assertNotManaged(doc: TransactionDocument): void {
    if (doc.installmentPurchaseId) {
      throw new ConflictException(
        'This transaction is managed by an installment purchase',
      );
    }
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
  async assertReferences(
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

    const hadCards = new Set([before?.creditCardId, before?.toCreditCardId]);
    for (const cardId of [after.creditCardId, after.toCreditCardId]) {
      if (!cardId) continue;
      const card = await this.cards.findOne(userId, cardId);
      if (card.isArchived && !hadCards.has(cardId)) {
        throw new ConflictException('Credit card is archived');
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
