import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Starts one in-memory MongoDB for the whole test run.
 *
 * Starting a server per test file cost roughly a second each and dominated the
 * suite. One server is started here, its URI is published to the workers
 * through the environment, and each worker uses its own database on it
 * (`setup-db.ts`), so files stay isolated without paying that cost repeatedly.
 */

let server: MongoMemoryServer | undefined;

export async function setup(): Promise<void> {
  server = await MongoMemoryServer.create();
  // Workers are forked from this process, so they inherit the variable.
  process.env.MONGO_MEMORY_URI = server.getUri();
}

export async function teardown(): Promise<void> {
  await server?.stop();
  server = undefined;
}
