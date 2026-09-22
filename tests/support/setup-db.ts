import mongoose from 'mongoose';
import { afterEach, beforeAll } from 'vitest';
import { connectDatabase } from '../../src/core/db.js';

/**
 * Connects a test file to the shared in-memory MongoDB.
 *
 * The server itself is started once per run in `global-setup.ts`. Each Vitest
 * worker connects to its own database on that server, so files running in
 * parallel cannot see each other's documents while the expensive part — the
 * server start — happens only once.
 *
 * Tests run against real Mongoose models, not a mock, because much of what
 * needs testing *is* database behaviour: text indexes and their ranking, TTL
 * indexes, unique-index collisions during slug generation, and the
 * findOneAndUpdate revision check behind optimistic locking. A mocked driver
 * would let all of those pass while broken.
 */

/** One database per worker keeps parallel files isolated. */
function workerDatabaseName(): string {
  const worker = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '1';
  return `spa-ajibade-test-${worker}`;
}

/**
 * Remove all documents without dropping collections, which would drop their
 * indexes and quietly void every test that depends on one.
 */
export async function clearCollections(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

/** Registers the lifecycle hooks. Call once at the top of a test file. */
export function setupTestDb(): void {
  beforeAll(async () => {
    const uri = process.env.MONGO_MEMORY_URI;
    if (uri === undefined) {
      throw new Error(
        'MONGO_MEMORY_URI is not set. tests/support/global-setup.ts should have started the ' +
          'in-memory server; check `globalSetup` in vitest.config.ts.'
      );
    }

    // connectDatabase is idempotent, so later files in the same worker reuse
    // the open connection instead of reconnecting.
    await connectDatabase(`${uri}${workerDatabaseName()}`);
    await clearCollections();
  });

  afterEach(async () => {
    await clearCollections();
  });
}
