import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

const userId = new Types.ObjectId().toString();
const otherId = new Types.ObjectId().toString();

const firstArg = (m: jest.Mock): Record<string, unknown> =>
  (m.mock.calls as unknown[][])[0][0] as Record<string, unknown>;

function query(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  q.sort = jest.fn(() => q);
  q.collation = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'Banco',
    type: 'checking',
    balanceCents: 1000,
    isArchived: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AccountsService', () => {
  let model: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock };
  let service: AccountsService;

  beforeEach(() => {
    model = { find: jest.fn(), findOne: jest.fn(), create: jest.fn() };
    service = new AccountsService(model as never);
  });

  describe('create', () => {
    const base = { type: 'cash' as const, name: 'Billetera' };

    beforeEach(() => {
      model.findOne.mockReturnValue(query(null));
      model.create.mockResolvedValue(makeDoc());
    });

    it.each([
      [150050, 150050],
      [undefined, 0],
      [-2000, -2000],
    ])(
      'sets balanceCents from initialBalanceCents %p -> %p',
      async (initial, expected) => {
        await service.create(userId, { ...base, initialBalanceCents: initial });
        const created = firstArg(model.create);
        expect(created.balanceCents).toBe(expected);
        expect(String(created.userId)).toBe(userId);
      },
    );

    it('409s on an active duplicate name, ignoring case', async () => {
      const dup = query(makeDoc());
      model.findOne.mockReturnValue(dup);
      await expect(service.create(userId, base)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(dup.collation).toHaveBeenCalledWith({ locale: 'es', strength: 2 });
      expect(firstArg(model.findOne).isArchived).toBe(false);
    });
  });

  describe('DTO validation', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });

    it('UpdateAccountDto strips balanceCents', async () => {
      const result = (await pipe.transform(
        { name: 'X', balanceCents: 999 },
        { type: 'body', metatype: UpdateAccountDto },
      )) as Record<string, unknown>;
      expect(result.name).toBe('X');
      expect(result).not.toHaveProperty('balanceCents');
    });

    it('CreateAccountDto rejects a non-integer initialBalanceCents', async () => {
      await expect(
        pipe.transform(
          { type: 'cash', name: 'X', initialBalanceCents: 10.5 },
          { type: 'body', metatype: CreateAccountDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('filters by user and excludes archived unless asked', async () => {
      model.find.mockReturnValue(query([]));
      await service.findAll(userId);
      let filter = firstArg(model.find);
      expect(String(filter.userId)).toBe(userId);
      expect(filter.isArchived).toBe(false);

      model.find.mockClear();
      await service.findAll(userId, true);
      filter = firstArg(model.find);
      expect(filter).not.toHaveProperty('isArchived');
    });
  });

  describe('ownership', () => {
    it('findOne scopes to the user and 404s when not found', async () => {
      model.findOne.mockReturnValue(query(null));
      const id = new Types.ObjectId().toString();
      await expect(service.findOne(otherId, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(String(firstArg(model.findOne).userId)).toBe(otherId);
    });

    it('update and archive 404 for an account the user does not own', async () => {
      model.findOne.mockReturnValue(query(null));
      const id = new Types.ObjectId().toString();
      await expect(
        service.update(userId, id, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.archive(userId, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('409s when renaming to another active account name', async () => {
      const doc = makeDoc();
      // 1st lookup: the account itself; 2nd: duplicate check
      model.findOne
        .mockReturnValueOnce(query(doc))
        .mockReturnValueOnce(query(makeDoc({ name: 'Ahorros' })));
      await expect(
        service.update(userId, String(doc._id), { name: 'ahorros' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('allows a name already used only by an archived account', async () => {
      const doc = makeDoc();
      model.findOne
        .mockReturnValueOnce(query(doc))
        .mockReturnValueOnce(query(null));
      await service.update(userId, String(doc._id), { name: 'Viejo' });
      expect(doc.name).toBe('Viejo');
      expect(doc.save).toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('sets isArchived and saves without deleting', async () => {
      const doc = makeDoc();
      model.findOne.mockReturnValue(query(doc));
      await service.archive(userId, String(doc._id));
      expect(doc.isArchived).toBe(true);
      expect(doc.save).toHaveBeenCalled();
    });
  });
});
