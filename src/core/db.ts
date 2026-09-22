import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Database lifecycle.
 *
 * Indexes are never built automatically outside development: an index created
 * on a live collection blocks writes, so staging and production get theirs from
 * `npm run db:sync-indexes` at deploy time instead.
 */

const POOL_OPTIONS: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  minPoolSize: 1,
  // Fail fast when the cluster is unreachable rather than hanging a request.
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  family: 4,
};

let connecting: Promise<typeof mongoose> | undefined;

export async function connectDatabase(uri: string = config.MONGODB_URI): Promise<void> {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) return;

  // Guard against two callers racing to connect during startup.
  connecting ??= mongoose.connect(uri, {
    ...POOL_OPTIONS,
    autoIndex: config.NODE_ENV === 'development' || config.NODE_ENV === 'test',
  });

  try {
    await connecting;
    logger.info('database connected');
  } finally {
    connecting = undefined;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) return;
  await mongoose.disconnect();
  logger.info('database disconnected');
}

/** Register connection-level logging once, at startup. */
export function observeDatabase(): void {
  mongoose.connection.on('error', (error: unknown) => {
    logger.error({ err: error }, 'database connection error');
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('database disconnected');
  });
}
