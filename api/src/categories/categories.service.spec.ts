import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CategoriesService } from './categories.service';

const userId = new Types.ObjectId().toString();
const otherId = new Types.ObjectId().toString();

const firstArg = (m: jest.Mock): Record<string, unknown> =>
  (m.mock.calls as unknown[][])[0][0] as Record<string, unknown>;

/** Chainable stand-in for a Mongoose Query. */
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
    name: 'Comida',
    type: 'expense',
    isArchived: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CategoriesService', () => {
  let model: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    model = { find: jest.fn(), findOne: jest.fn(), create: jest.fn() };
    service = new CategoriesService(model as never);
  });

  describe('findAll', () => {
    it('filters by user and excludes archived by default', async () => {
      model.find.mockReturnValue(query([]));
      await service.findAll(userId, {});
      const filter = firstArg(model.find);
      expect(String(filter.userId)).toBe(userId);
      expect(filter.isArchived).toBe(false);
    });

    it('includes archived when asked and filters by type', async () => {
      model.find.mockReturnValue(query([]));
      await service.findAll(userId, { includeArchived: true, type: 'income' });
      const filter = firstArg(model.find);
      expect(filter).not.toHaveProperty('isArchived');
      expect(filter.type).toBe('income');
      expect(String(filter.userId)).toBe(userId);
    });
  });

  describe('ownership', () => {
    it('findOne scopes the lookup to the user and 404s when not found', async () => {
      model.findOne.mockReturnValue(query(null));
      const id = new Types.ObjectId().toString();
      await expect(service.findOne(otherId, id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const filter = firstArg(model.findOne);
      expect(String(filter.userId)).toBe(otherId);
      expect(String(filter._id)).toBe(id);
    });

    it('update and archive 404 for a category the user does not own', async () => {
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

  describe('create', () => {
    const dto = {
      type: 'expense' as const,
      name: 'comida',
      icon: 'utensils',
      color: '#f97316',
    };

    it('409s when an active category with that name and type exists (case-insensitive)', async () => {
      const dup = query(makeDoc());
      model.findOne.mockReturnValue(dup);
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(dup.collation).toHaveBeenCalledWith({ locale: 'es', strength: 2 });
      const filter = firstArg(model.findOne);
      expect(filter.isArchived).toBe(false);
      expect(filter.type).toBe('expense');
    });

    it('creates with the authenticated userId when there is no duplicate', async () => {
      model.findOne.mockReturnValue(query(null));
      model.create.mockResolvedValue(makeDoc());
      await service.create(userId, dto);
      const created = firstArg(model.create);
      expect(String(created.userId)).toBe(userId);
      expect(created.name).toBe('comida');
    });
  });

  describe('update', () => {
    it('409s when renaming to a name used by another active category', async () => {
      const doc = makeDoc();
      // 1st lookup: the category itself; 2nd: duplicate check
      model.findOne
        .mockReturnValueOnce(query(doc))
        .mockReturnValueOnce(query(makeDoc({ name: 'Transporte' })));
      await expect(
        service.update(userId, String(doc._id), { name: 'transporte' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(doc.save).not.toHaveBeenCalled();
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
