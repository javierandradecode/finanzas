import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Types } from 'mongoose';
import { UpdateSubcategoryDto } from './dto/subcategory.dto';
import { CategoriesService } from './categories.service';

const userId = new Types.ObjectId().toString();

function query(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
}

function makeSub(name: string, isArchived = false) {
  return { _id: new Types.ObjectId(), name, isArchived };
}

function makeCategory(subs = [makeSub('Supermercado')]) {
  return {
    _id: new Types.ObjectId(),
    subcategories: subs,
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CategoriesService subcategories', () => {
  let model: { findOne: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    model = { findOne: jest.fn() };
    service = new CategoriesService(model as never);
  });

  describe('addSubcategory', () => {
    it('404s for a category the user does not own', async () => {
      model.findOne.mockReturnValue(query(null));
      await expect(
        service.addSubcategory(userId, new Types.ObjectId().toString(), {
          name: 'X',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s on an active duplicate name, ignoring case', async () => {
      const cat = makeCategory();
      model.findOne.mockReturnValue(query(cat));
      await expect(
        service.addSubcategory(userId, String(cat._id), {
          name: 'supermercado',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(cat.save).not.toHaveBeenCalled();
    });

    it('allows reusing the name of an archived subcategory', async () => {
      const cat = makeCategory([makeSub('Supermercado', true)]);
      model.findOne.mockReturnValue(query(cat));
      await service.addSubcategory(userId, String(cat._id), {
        name: 'Supermercado',
      });
      expect(cat.subcategories).toHaveLength(2);
      expect(cat.save).toHaveBeenCalled();
    });
  });

  describe('updateSubcategory / archiveSubcategory', () => {
    it('404s when the subcategory is not in that category', async () => {
      const cat = makeCategory();
      model.findOne.mockReturnValue(query(cat));
      const missing = new Types.ObjectId().toString();
      await expect(
        service.updateSubcategory(userId, String(cat._id), missing, {
          name: 'X',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.archiveSubcategory(userId, String(cat._id), missing),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies only the provided fields (DTO instances carry undefined keys)', async () => {
      const sub = makeSub('Supermercado');
      const cat = makeCategory([sub]);
      model.findOne.mockReturnValue(query(cat));
      const dto = plainToInstance(UpdateSubcategoryDto, { name: 'Mercado' });
      await service.updateSubcategory(
        userId,
        String(cat._id),
        String(sub._id),
        dto,
      );
      expect(sub.name).toBe('Mercado');
      expect(sub.isArchived).toBe(false);
    });

    it('archiving keeps the subcategory and its _id', async () => {
      const sub = makeSub('Supermercado');
      const cat = makeCategory([sub]);
      model.findOne.mockReturnValue(query(cat));
      await service.archiveSubcategory(
        userId,
        String(cat._id),
        String(sub._id),
      );
      expect(cat.subcategories).toHaveLength(1);
      expect(cat.subcategories[0]._id).toBe(sub._id);
      expect(cat.subcategories[0].isArchived).toBe(true);
      expect(cat.save).toHaveBeenCalled();
    });
  });
});
