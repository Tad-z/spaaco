import { rm } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TEST_ENV } from './test-env.js';

/**
 * Starts one in-memory MongoDB for the whole test run.
 *
 * Starting a server per test file cost roughly a second each and dominated the
 * suite. One server is started here, its URI is published to the workers
 * through the environment, and each worker uses its own database on it
 * (`setup-db.ts`), so files stay isolated without paying that cost repeatedly.
 */

let server: MongoMemoryServer | undefined;

/** The upload tests exercise the real local drivers, which write real files. */
const clearUploads = async (): Promise<void> => {
  await Promise.all(
    [
      TEST_ENV.UPLOAD_DIR ?? './.uploads-test',
      TEST_ENV.PRIVATE_UPLOAD_DIR ?? './.private-uploads-test',
    ].map((directory) => rm(directory, { recursive: true, force: true }))
  );
};

export async function setup(): Promise<void> {
  // Started clean, so one run's uploads cannot be mistaken for another's.
  await clearUploads();
  server = await MongoMemoryServer.create();
  // Workers are forked from this process, so they inherit the variable.
  process.env.MONGO_MEMORY_URI = server.getUri();
}

export async function teardown(): Promise<void> {
  await server?.stop();
  server = undefined;
  await clearUploads();
}
