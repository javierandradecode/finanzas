import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AccountsService } from './accounts.service';

const userId = new Types.ObjectId().toString();
const accA = new Types.ObjectId().toString();
const accB = new Types.ObjectId().toString();
const session = { id: 'session' } as never;

describe('AccountsService.applyDeltas', () => {
  let model: { bulkWrite: jest.Mock };
  let service: AccountsService;

  beforeEach(() => {
    model = { bulkWrite: jest.fn() };
    service = new AccountsService(model as never);
  });

  it('issues one $inc per account scoped to the user and passes the session', async () => {
    model.bulkWrite.mockResolvedValue({ matchedCount: 2 });
    await service.applyDeltas(
      userId,
      new Map([
        [accA, -2000],
        [accB, 2000],
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
    expect(String(ops[0].updateOne.filter._id)).toBe(accA);
    expect(ops[0].updateOne.update).toEqual({ $inc: { balanceCents: -2000 } });
    expect(ops[1].updateOne.update).toEqual({ $inc: { balanceCents: 2000 } });
    expect(options.session).toBe(session);
  });

  it('throws NotFoundException when an account did not match', async () => {
    model.bulkWrite.mockResolvedValue({ matchedCount: 1 });
    await expect(
      service.applyDeltas(
        userId,
        new Map([
          [accA, -1],
          [accB, 1],
        ]),
        session,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does nothing for an empty delta map', async () => {
    await service.applyDeltas(userId, new Map(), session);
    expect(model.bulkWrite).not.toHaveBeenCalled();
  });
});
