import mongoose from 'mongoose';
import { mongoTestOptions, startMongo } from '../../test/mongo-memory';

jest.setTimeout(180_000);

describe('in-memory replica set', () => {
  let stop: () => Promise<void>;
  let conn: mongoose.Connection;

  beforeAll(async () => {
    const mongo = await startMongo();
    stop = mongo.stop;
    conn = await mongoose
      .createConnection(mongo.uri, mongoTestOptions)
      .asPromise();
  });

  afterAll(async () => {
    await conn.close();
    await stop();
  });

  it('rolls back a failed transaction and commits a successful one', async () => {
    const items = conn.collection('items');

    await expect(
      conn.transaction(async (session) => {
        await items.insertOne({ name: 'rolled-back' }, { session });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await items.countDocuments({ name: 'rolled-back' })).toBe(0);

    await conn.transaction(async (session) => {
      await items.insertOne({ name: 'committed' }, { session });
    });
    expect(await items.countDocuments({ name: 'committed' })).toBe(1);
  });
});
