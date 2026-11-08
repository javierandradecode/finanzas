import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const ACCOUNT_TYPES = ['cash', 'savings', 'checking'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

@Schema({ timestamps: true })
export class Account {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ACCOUNT_TYPES })
  type!: AccountType;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Money as integer cents. Only set on creation; phase 4 moves it with transactions. */
  @Prop({ required: true, default: 0 })
  balanceCents!: number;

  @Prop({ required: true, default: false })
  isArchived!: boolean;
}

export type AccountDocument = HydratedDocument<Account>;
export const AccountSchema = SchemaFactory.createForClass(Account);
