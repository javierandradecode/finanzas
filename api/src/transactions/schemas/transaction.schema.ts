import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { TxType } from '../transaction-effects';

export const TX_TYPES = ['income', 'expense', 'transfer'] as const;
export const TX_SOURCES = ['manual', 'subscription', 'installment'] as const;
export type TxSource = (typeof TX_SOURCES)[number];

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: TX_TYPES })
  type!: TxType;

  /** Money as integer cents, always positive; `type` gives the direction. */
  @Prop({ required: true })
  amountCents!: number;

  /** Stored in UTC. */
  @Prop({ required: true })
  date!: Date;

  /** Income: receiving account. Expense: paying account. Transfer: origin. */
  @Prop({ type: Types.ObjectId, ref: 'Account', required: true })
  accountId!: Types.ObjectId;

  /** Transfers only: destination account. */
  @Prop({ type: Types.ObjectId, ref: 'Account' })
  toAccountId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  subcategoryId?: Types.ObjectId;

  @Prop({ trim: true })
  note?: string;

  @Prop({ type: String, required: true, enum: TX_SOURCES, default: 'manual' })
  source!: TxSource;
}

export type TransactionDocument = HydratedDocument<Transaction>;
export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, categoryId: 1 });
