import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Connection } from 'mongoose';
import { CategoriesService } from '../categories/categories.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { AuthResponse, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
const MONGO_DUPLICATE_KEY = 11000;
// Compared against when the email does not exist, so timing doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly categories: CategoriesService,
    private readonly jwt: JwtService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.connection.transaction(async (session) => {
        const created = await this.users.create(
          { email, passwordHash, name: dto.name },
          session,
        );
        await this.categories.createDefaults(created._id, session);
        return created;
      });
      return this.buildResponse(user);
    } catch (error) {
      if ((error as { code?: number }).code === MONGO_DUPLICATE_KEY) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    const valid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.buildResponse(user);
  }

  private buildResponse(user: UserDocument): AuthResponse {
    const payload: JwtPayload = { sub: user._id.toString(), email: user.email };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        currency: user.currency,
      },
    };
  }
}
