import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class CreditCard {
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
  limitCents!: number;

  /** Day of the month the statement closes (1-31; short months use their last day). */
  @Prop({ required: true })
  cutoffDay!: number;

  /** Day of the month the statement is due. */
  @Prop({ required: true })
  paymentDay!: number;

  /** Informational; installment purchases carry their own rate. */
  @Prop({ required: true, default: 0 })
  annualRatePercent!: number;

  /** Amount owed, in cents. Only changes through transactions. */
  @Prop({ required: true, default: 0 })
  debtCents!: number;

  @Prop({ required: true, default: false })
  isArchived!: boolean;
}

export type CreditCardDocument = HydratedDocument<CreditCard>;
export const CreditCardSchema = SchemaFactory.createForClass(CreditCard);

CreditCardSchema.virtual('availableCents').get(function (this: CreditCard) {
  return this.limitCents - this.debtCents;
});
