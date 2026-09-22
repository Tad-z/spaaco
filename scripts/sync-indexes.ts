#!/usr/bin/env tsx
/**
 * Applies every index declared in the models to the connected database.
 *
 * Run at deploy time rather than relying on `autoIndex`: building an index on a
 * live collection blocks writes, so it must be a deliberate step, not something
 * that happens the first time a process starts.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/core/db.js';
import { logger } from '../src/core/logger.js';
import '../src/models/index.js';

async function main(): Promise<void> {
  await connectDatabase();

  const names = mongoose.modelNames().sort();
  logger.info({ models: names.length }, 'syncing indexes');

  for (const name of names) {
    const model = mongoose.model(name);
    // syncIndexes also drops indexes no longer declared, which keeps a renamed
    // or removed index from lingering.
    const dropped = await model.syncIndexes();
    const indexes = await model.listIndexes();
    logger.info(
      { model: name, indexes: indexes.length, dropped: dropped.length },
      'indexes synced'
    );
  }

  await disconnectDatabase();
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to sync indexes');
  process.exit(1);
});
