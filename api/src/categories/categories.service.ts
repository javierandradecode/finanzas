import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DEFAULT_CATEGORIES } from './default-categories';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  Category,
  CategoryDocument,
  CategoryType,
} from './schemas/category.schema';

const CASE_INSENSITIVE = { locale: 'es', strength: 2 } as const;

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

  findAll(
    userId: string,
    opts: { type?: CategoryType; includeArchived?: boolean },
  ): Promise<CategoryDocument[]> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (opts.type) filter.type = opts.type;
    if (!opts.includeArchived) filter.isArchived = false;
    return this.model.find(filter).sort({ type: 1, name: 1 }).exec();
  }

  async findOne(userId: string, id: string): Promise<CategoryDocument> {
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Category not found');
    return doc;
  }

  async create(
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryDocument> {
    await this.assertNameFree(userId, dto.type, dto.name);
    return this.model.create({ ...dto, userId: new Types.ObjectId(userId) });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const doc = await this.findOne(userId, id);
    const willBeActive = dto.isArchived ?? doc.isArchived;
    const identityChanges =
      dto.name !== undefined || (doc.isArchived && dto.isArchived === false);
    if (!willBeActive && identityChanges) {
      await this.assertNameFree(
        userId,
        doc.type,
        dto.name ?? doc.name,
        doc._id,
      );
    }
    Object.assign(doc, dto);
    await doc.save();
    return doc;
  }

  async archive(userId: string, id: string): Promise<void> {
    const doc = await this.findOne(userId, id);
    doc.isArchived = true;
    await doc.save();
  }

  private async assertNameFree(
    userId: string,
    type: CategoryType,
    name: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      type,
      name,
      isArchived: false,
    };
    if (excludeId) filter._id = { $ne: excludeId };
    const dup = await this.model
      .findOne(filter)
      .collation(CASE_INSENSITIVE)
      .exec();
    if (dup) throw new ConflictException('Category name already in use');
  }
}
