import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/core/db.js';

/**
 * An in-memory MongoDB for one test file.
 *
 * Tests run against real Mongoose models, not a mock, because much of what
 * needs testing *is* database behaviour: text indexes and their ranking, TTL
 * indexes, unique-index collisions during slug generation, and the
 * findOneAndUpdate revision check behind optimistic locking. A mocked driver
 * would let all of those pass while broken.
 *
 * Each test file gets its own server, so files stay isolated under vitest's
 * parallel execution, and collections are emptied after every test so order
 * never matters.
 */

let server: MongoMemoryServer | undefined;

/** Remove all documents without dropping collections, which would drop indexes too. */
export async function clearCollections(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

/** Registers the lifecycle hooks. Call once at the top of a test file. */
export function setupTestDb(): void {
  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    await connectDatabase(server.getUri('spa-ajibade-test'));
  });

  afterEach(async () => {
    await clearCollections();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await server?.stop();
    server = undefined;
  });
}
