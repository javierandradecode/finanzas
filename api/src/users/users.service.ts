import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  create(data: CreateUserData, session?: ClientSession): Promise<UserDocument> {
    return new this.model(data).save({ session });
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.model.findById(id).exec();
  }
}
