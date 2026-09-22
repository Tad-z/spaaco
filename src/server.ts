import type { Server } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './core/logger.js';

/**
 * Process entry point: connect, listen, and shut down cleanly.
 *
 * Graceful shutdown matters in a container: on SIGTERM the platform stops
 * routing new traffic but existing requests are still in flight, so the server
 * stops accepting connections, drains, and only then closes the database.
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function start(): Promise<void> {
  // Imported lazily so a config or DB failure is reported by this handler
  // rather than crashing during module evaluation.
  const { connectDatabase, disconnectDatabase } = await import('./core/db.js');

  await connectDatabase();

  const app = createApp();
  const server: Server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
  });

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Stop accepting connections, then wait for in-flight requests to finish.
    server.close((closeError) => {
      if (closeError) logger.error({ err: closeError }, 'error closing server');

      void disconnectDatabase()
        .catch((error: unknown) => {
          logger.error({ err: error }, 'error closing database connection');
        })
        .finally(() => {
          process.exit(closeError ? 1 : 0);
        });
    });

    // A connection that refuses to drain must not hold the process open forever.
    setTimeout(() => {
      logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
