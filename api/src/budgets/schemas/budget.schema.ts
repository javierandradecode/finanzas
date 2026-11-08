import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** Spending limit for one expense category in one month. */
@Schema({ timestamps: true })
export class Budget {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    required: true,
  })
  categoryId!: Types.ObjectId;

  /** "YYYY-MM" (UTC). */
  @Prop({ required: true })
  month!: string;

  @Prop({ required: true })
  limitCents!: number;
}

export type BudgetDocument = HydratedDocument<Budget>;
export const BudgetSchema = SchemaFactory.createForClass(Budget);

// One budget per category and month.
BudgetSchema.index({ userId: 1, categoryId: 1, month: 1 }, { unique: true });
// Listing a month is the common query.
BudgetSchema.index({ userId: 1, month: 1 });
