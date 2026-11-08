import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { FREQUENCIES } from '../recurrence';
import type { Frequency } from '../recurrence';

@Schema({ timestamps: true })
export class Subscription {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true })
  amountCents!: number;

  @Prop({ type: String, required: true, enum: FREQUENCIES })
  frequency!: Frequency;

  /** Next charge date (UTC midnight). The processor advances it. */
  @Prop({ required: true })
  nextDate!: Date;

  /** Day of the month of the first charge; keeps a 31st on the 31st after short months. */
  @Prop({ required: true })
  anchorDay!: number;

  /** Payer: exactly one of accountId / creditCardId. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account' })
  accountId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'CreditCard' })
  creditCardId?: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    required: true,
  })
  categoryId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  subcategoryId?: Types.ObjectId;

  @Prop({ required: true, default: true })
  active!: boolean;

  /** Why the last attempt to charge failed; cleared by the next success. */
  @Prop()
  lastError?: string;

  @Prop()
  lastErrorAt?: Date;
}

export type SubscriptionDocument = HydratedDocument<Subscription>;
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ userId: 1, active: 1, nextDate: 1 });
