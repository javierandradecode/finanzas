import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Account, AccountDocument } from './schemas/account.schema';

const CASE_INSENSITIVE = { locale: 'es', strength: 2 } as const;

@Injectable()
export class AccountsService {
  constructor(
    @InjectModel(Account.name) private readonly model: Model<Account>,
  ) {}

  findAll(userId: string, includeArchived = false): Promise<AccountDocument[]> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (!includeArchived) filter.isArchived = false;
    return this.model.find(filter).sort({ name: 1 }).exec();
  }

  async findOne(userId: string, id: string): Promise<AccountDocument> {
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!doc) throw new NotFoundException('Account not found');
    return doc;
  }

  async create(
    userId: string,
    dto: CreateAccountDto,
  ): Promise<AccountDocument> {
    await this.assertNameFree(userId, dto.name);
    return this.model.create({
      userId: new Types.ObjectId(userId),
      type: dto.type,
      name: dto.name,
      balanceCents: dto.initialBalanceCents ?? 0,
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAccountDto,
  ): Promise<AccountDocument> {
    const doc = await this.findOne(userId, id);
    const willBeActive = !(dto.isArchived ?? doc.isArchived);
    const identityChanges =
      dto.name !== undefined || (doc.isArchived && dto.isArchived === false);
    if (willBeActive && identityChanges) {
      await this.assertNameFree(userId, dto.name ?? doc.name, doc._id);
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
    name: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      name,
      isArchived: false,
    };
    if (excludeId) filter._id = { $ne: excludeId };
    const dup = await this.model
      .findOne(filter)
      .collation(CASE_INSENSITIVE)
      .exec();
    if (dup) throw new ConflictException('Account name already in use');
  }
}
