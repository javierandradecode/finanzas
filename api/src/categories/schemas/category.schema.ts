import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CategoryType = 'income' | 'expense';

@Schema()
export class Subcategory {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, default: false })
  isArchived!: boolean;
}
export const SubcategorySchema = SchemaFactory.createForClass(Subcategory);

@Schema({ timestamps: true })
export class Category {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['income', 'expense'] })
  type!: CategoryType;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true })
  icon!: string;

  @Prop({ required: true })
  color!: string;

  @Prop({ required: true, default: false })
  isArchived!: boolean;

  @Prop({ type: [SubcategorySchema], default: [] })
  subcategories!: Types.DocumentArray<Subcategory>;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
