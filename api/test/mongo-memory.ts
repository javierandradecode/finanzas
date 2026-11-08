import * as os from 'os';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export interface InMemoryMongo {
  uri: string;
  stop: () => Promise<void>;
}

/**
 * Connection options for tests. The MongoDB driver loads `os` with a dynamic
 * `import()`, which Jest's CommonJS sandbox does not support, so the handshake
 * metadata would come out empty and the server would reject the connection.
 * Passing the adapter explicitly avoids that. Not needed outside Jest.
 */
export const mongoTestOptions = { runtimeAdapters: { os } };

/** Starts a single-node replica set (required for MongoDB transactions). */
export async function startMongo(): Promise<InMemoryMongo> {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: '7.0.14' },
    replSet: { count: 1 },
  });
  return {
    uri: replSet.getUri(),
    stop: async () => {
      await replSet.stop();
    },
  };
}
