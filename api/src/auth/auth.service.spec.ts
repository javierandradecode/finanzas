import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { CategoriesService } from '../categories/categories.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const fakeSession = { id: 'session' };

function makeUser(passwordHash: string) {
  return {
    _id: new Types.ObjectId(),
    email: 'ana@x.com',
    name: 'Ana',
    currency: 'USD',
    passwordHash,
  };
}

describe('AuthService', () => {
  let users: { findByEmail: jest.Mock; create: jest.Mock };
  let categories: { createDefaults: jest.Mock };
  let jwt: { sign: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    users = { findByEmail: jest.fn(), create: jest.fn() };
    categories = { createDefaults: jest.fn().mockResolvedValue(undefined) };
    jwt = { sign: jest.fn().mockReturnValue('signed-token') };
    const connection = {
      transaction: (fn: (s: unknown) => Promise<unknown>) => fn(fakeSession),
    };
    service = new AuthService(
      users as unknown as UsersService,
      categories as unknown as CategoriesService,
      jwt as unknown as JwtService,
      connection as never,
    );
  });

  describe('register', () => {
    const dto = { email: ' Ana@X.com ', password: 'password123', name: 'Ana' };

    beforeEach(() => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockImplementation((data: { passwordHash: string }) =>
        Promise.resolve(makeUser(data.passwordHash)),
      );
    });

    it('normalizes the email', async () => {
      await service.register(dto);
      expect(users.findByEmail).toHaveBeenCalledWith('ana@x.com');
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@x.com' }),
        fakeSession,
      );
    });

    it('stores a bcrypt hash and creates default categories in the same session', async () => {
      await service.register(dto);
      const [data, session] = users.create.mock.calls[0] as [
        { passwordHash: string },
        unknown,
      ];
      expect(data.passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', data.passwordHash)).toBe(true);
      expect(session).toBe(fakeSession);
      expect(categories.createDefaults).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        fakeSession,
      );
    });

    it('rejects a duplicate email with ConflictException', async () => {
      users.findByEmail.mockResolvedValue(makeUser('x'));
      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('propagates the error when default categories fail', async () => {
      categories.createDefaults.mockRejectedValue(new Error('db down'));
      await expect(service.register(dto)).rejects.toThrow('db down');
    });

    it('returns a token and a user without password data', async () => {
      const res = await service.register(dto);
      expect(res.accessToken).toBe('signed-token');
      expect(res.user).toMatchObject({
        email: 'ana@x.com',
        name: 'Ana',
        currency: 'USD',
      });
      const json = JSON.stringify(res);
      expect(json).not.toContain('passwordHash');
      expect(json).not.toContain('password123');
    });
  });

  describe('login', () => {
    it('signs a token with sub and email for valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 10);
      const user = makeUser(hash);
      users.findByEmail.mockResolvedValue(user);
      const res = await service.login({
        email: 'Ana@x.com',
        password: 'password123',
      });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: user._id.toString(),
        email: 'ana@x.com',
      });
      expect(res.accessToken).toBe('signed-token');
      expect(JSON.stringify(res)).not.toContain('passwordHash');
    });

    it('fails identically for unknown email and wrong password', async () => {
      users.findByEmail.mockResolvedValue(null);
      const unknown = service
        .login({ email: 'no@x.com', password: 'whatever123' })
        .catch((e: unknown) => e);

      users.findByEmail.mockResolvedValue(
        makeUser(await bcrypt.hash('password123', 10)),
      );
      const wrong = service
        .login({ email: 'ana@x.com', password: 'wrong-password' })
        .catch((e: unknown) => e);

      const [a, b] = await Promise.all([unknown, wrong]);
      expect(a).toBeInstanceOf(UnauthorizedException);
      expect(b).toBeInstanceOf(UnauthorizedException);
      expect((a as Error).message).toBe('Invalid credentials');
      expect((b as Error).message).toBe('Invalid credentials');
    });
  });
});
