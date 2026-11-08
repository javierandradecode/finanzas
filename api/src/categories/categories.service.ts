import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { definedOnly } from '../common/utils/defined-only';
import { DEFAULT_CATEGORIES } from './default-categories';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CreateSubcategoryDto,
  UpdateSubcategoryDto,
} from './dto/subcategory.dto';
import {
  Category,
  CategoryDocument,
  CategoryType,
  Subcategory,
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
    Object.assign(doc, definedOnly(dto));
    await doc.save();
    return doc;
  }

  async archive(userId: string, id: string): Promise<void> {
    const doc = await this.findOne(userId, id);
    doc.isArchived = true;
    await doc.save();
  }

  async addSubcategory(
    userId: string,
    categoryId: string,
    dto: CreateSubcategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.findOne(userId, categoryId);
    this.assertSubNameFree(category, dto.name);
    category.subcategories.push({
      name: dto.name,
      isArchived: false,
    });
    await category.save();
    return category;
  }

  async updateSubcategory(
    userId: string,
    categoryId: string,
    subId: string,
    dto: UpdateSubcategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.findOne(userId, categoryId);
    const sub = this.findSub(category, subId);
    const willBeActive = !(dto.isArchived ?? sub.isArchived);
    const identityChanges =
      dto.name !== undefined || (sub.isArchived && dto.isArchived === false);
    if (willBeActive && identityChanges) {
      this.assertSubNameFree(category, dto.name ?? sub.name, sub._id);
    }
    Object.assign(sub, definedOnly(dto));
    await category.save();
    return category;
  }

  async archiveSubcategory(
    userId: string,
    categoryId: string,
    subId: string,
  ): Promise<void> {
    const category = await this.findOne(userId, categoryId);
    this.findSub(category, subId).isArchived = true;
    await category.save();
  }

  private findSub(category: CategoryDocument, subId: string): Subcategory {
    const sub = category.subcategories.find((s) => String(s._id) === subId);
    if (!sub) throw new NotFoundException('Subcategory not found');
    return sub;
  }

  private assertSubNameFree(
    category: CategoryDocument,
    name: string,
    excludeId?: Types.ObjectId,
  ): void {
    const dup = category.subcategories.some(
      (s) =>
        !s.isArchived &&
        !(excludeId && String(s._id) === String(excludeId)) &&
        s.name.localeCompare(name, 'es', { sensitivity: 'accent' }) === 0,
    );
    if (dup) throw new ConflictException('Subcategory name already in use');
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
