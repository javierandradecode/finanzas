import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DEFAULT_CATEGORIES } from './default-categories';
import { Category } from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly model: Model<Category>,
  ) {}

  async createDefaults(
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const docs = DEFAULT_CATEGORIES.map((c) => ({ ...c, userId }));
    await this.model.insertMany(docs, { session });
  }
}
