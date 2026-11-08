import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class InstallmentPurchase {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'CreditCard',
    required: true,
  })
  creditCardId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    required: true,
  })
  categoryId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  subcategoryId?: Types.ObjectId;

  /** Principal, in cents. Never changes after creation. */
  @Prop({ required: true })
  totalCents!: number;

  @Prop({ required: true })
  installments!: number;

  @Prop({ required: true, default: 0 })
  annualRatePercent!: number;

  /** Purchase date (UTC). */
  @Prop({ required: true })
  startDate!: Date;

  /**
   * Snapshots taken at creation so editing the card later does not move this
   * purchase's calendar.
   */
  @Prop({ required: true })
  firstDueDate!: Date;

  @Prop({ required: true })
  paymentDay!: number;

  @Prop({ required: true, default: 0 })
  paidInstallments!: number;

  /** The expense on the card that raised the debt by `totalCents`. */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
  })
  purchaseTransactionId!: Types.ObjectId;
}

export type InstallmentPurchaseDocument = HydratedDocument<InstallmentPurchase>;
export const InstallmentPurchaseSchema =
  SchemaFactory.createForClass(InstallmentPurchase);

InstallmentPurchaseSchema.index({ userId: 1, creditCardId: 1 });
