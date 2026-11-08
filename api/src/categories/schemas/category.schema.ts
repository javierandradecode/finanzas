import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryType = 'income' | 'expense';

@Schema({ timestamps: true })
export class Category {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['income', 'expense'] })
  type!: CategoryType;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true })
  icon!: string;

  @Prop({ required: true })
  color!: string;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
