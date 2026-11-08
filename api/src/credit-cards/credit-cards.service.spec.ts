import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import mongoose, { Types } from 'mongoose';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { CreditCardsService } from './credit-cards.service';
import { CreditCardSchema } from './schemas/credit-card.schema';

const userId = new Types.ObjectId().toString();
const otherId = new Types.ObjectId().toString();
const session = { id: 'session' } as never;

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
    name: 'Visa',
    limitCents: 100000,
    debtCents: 0,
    isArchived: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CreditCardsService', () => {
  let model: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    bulkWrite: jest.Mock;
  };
  let service: CreditCardsService;

  beforeEach(() => {
    model = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      bulkWrite: jest.fn(),
    };
    service = new CreditCardsService(model as never);
  });

  describe('schema', () => {
    it('exposes availableCents = limit - debt in JSON', () => {
      const Model = mongoose.model('CreditCardSchemaTest', CreditCardSchema);
      const card = new Model({ limitCents: 100000, debtCents: 3000 });
      expect(card.toJSON().availableCents).toBe(97000);
    });
  });

  describe('DTO validation', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const valid = {
      name: 'Visa',
      limitCents: 300000,
      cutoffDay: 15,
      paymentDay: 5,
    };

    it.each([
      ['cutoffDay 32', { cutoffDay: 32 }],
      ['cutoffDay 0', { cutoffDay: 0 }],
      ['paymentDay 32', { paymentDay: 32 }],
      ['limitCents 0', { limitCents: 0 }],
      ['fractional limitCents', { limitCents: 10.5 }],
      ['negative rate', { annualRatePercent: -1 }],
      ['fractional initialDebtCents', { initialDebtCents: 1.5 }],
    ])('CreateCreditCardDto rejects %s', async (_n, over) => {
      await expect(
        pipe.transform(
          { ...valid, ...over },
          { type: 'body', metatype: CreateCreditCardDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('UpdateCreditCardDto strips debtCents', async () => {
      const result = (await pipe.transform(
        { name: 'X', debtCents: 999 },
        { type: 'body', metatype: UpdateCreditCardDto },
      )) as Record<string, unknown>;
      expect(result).not.toHaveProperty('debtCents');
    });
  });

  describe('create', () => {
    const dto = {
      name: 'Visa',
      limitCents: 300000,
      cutoffDay: 15,
      paymentDay: 5,
    };

    beforeEach(() => {
      model.findOne.mockReturnValue(query(null));
      model.create.mockResolvedValue(makeDoc());
    });

    it.each([
      [undefined, 0],
      [25000, 25000],
    ])('initialDebtCents %p -> debtCents %p', async (initial, expected) => {
      await service.create(userId, { ...dto, initialDebtCents: initial });
      const created = firstArg(model.create);
      expect(created.debtCents).toBe(expected);
      expect(created.annualRatePercent).toBe(0);
      expect(String(created.userId)).toBe(userId);
    });

    it('409s on an active duplicate name, ignoring case', async () => {
      const dup = query(makeDoc());
      model.findOne.mockReturnValue(dup);
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(dup.collation).toHaveBeenCalledWith({ locale: 'es', strength: 2 });
    });
  });

  describe('queries', () => {
    it('findAll filters by user and hides archived unless asked', async () => {
      model.find.mockReturnValue(query([]));
      await service.findAll(userId);
      expect(String(firstArg(model.find).userId)).toBe(userId);
      expect(firstArg(model.find).isArchived).toBe(false);
      model.find.mockClear();
      await service.findAll(userId, true);
      expect(firstArg(model.find)).not.toHaveProperty('isArchived');
    });

    it('findOne, update and archive 404 for a card the user does not own', async () => {
      model.findOne.mockReturnValue(query(null));
      const id = new Types.ObjectId().toString();
      await expect(service.findOne(otherId, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(String(firstArg(model.findOne).userId)).toBe(otherId);
      await expect(
        service.update(userId, id, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.archive(userId, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update / archive', () => {
    it('applies only provided fields (DTO instances carry undefined keys)', async () => {
      const doc = makeDoc({ cutoffDay: 15, paymentDay: 5 });
      model.findOne
        .mockReturnValueOnce(query(doc))
        .mockReturnValueOnce(query(null));
      const dto = plainToInstance(UpdateCreditCardDto, { name: 'Nueva' });
      await service.update(userId, String(doc._id), dto);
      expect(doc.name).toBe('Nueva');
      expect(doc.limitCents).toBe(100000);
      expect(doc.cutoffDay).toBe(15);
      expect(doc.isArchived).toBe(false);
    });

    it('409s when renaming to another active card name', async () => {
      const doc = makeDoc();
      model.findOne
        .mockReturnValueOnce(query(doc))
        .mockReturnValueOnce(query(makeDoc({ name: 'Master' })));
      await expect(
        service.update(userId, String(doc._id), { name: 'master' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('archive sets isArchived without deleting', async () => {
      const doc = makeDoc();
      model.findOne.mockReturnValue(query(doc));
      await service.archive(userId, String(doc._id));
      expect(doc.isArchived).toBe(true);
      expect(doc.save).toHaveBeenCalled();
    });
  });

  describe('applyDebtDeltas', () => {
    const cardA = new Types.ObjectId().toString();
    const cardB = new Types.ObjectId().toString();

    it('issues one $inc on debtCents per card, scoped to the user, with the session', async () => {
      model.bulkWrite.mockResolvedValue({ matchedCount: 2 });
      await service.applyDebtDeltas(
        userId,
        new Map([
          [cardA, 3000],
          [cardB, -1000],
        ]),
        session,
      );
      const [ops, options] = model.bulkWrite.mock.calls[0] as [
        {
          updateOne: {
            filter: { _id: Types.ObjectId; userId: Types.ObjectId };
            update: unknown;
          };
        }[],
        { session: unknown },
      ];
      expect(ops).toHaveLength(2);
      expect(String(ops[0].updateOne.filter.userId)).toBe(userId);
      expect(String(ops[0].updateOne.filter._id)).toBe(cardA);
      expect(ops[0].updateOne.update).toEqual({ $inc: { debtCents: 3000 } });
      expect(ops[1].updateOne.update).toEqual({ $inc: { debtCents: -1000 } });
      expect(options.session).toBe(session);
    });

    it('throws NotFoundException when a card did not match', async () => {
      model.bulkWrite.mockResolvedValue({ matchedCount: 0 });
      await expect(
        service.applyDebtDeltas(userId, new Map([[cardA, 1]]), session),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does nothing for an empty delta map', async () => {
      await service.applyDebtDeltas(userId, new Map(), session);
      expect(model.bulkWrite).not.toHaveBeenCalled();
    });
  });
});
