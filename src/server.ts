import type { Server } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './core/logger.js';
import { captureError } from './core/error-tracking.js';
import { createServerLifecycle } from './core/lifecycle.js';
import { startRetentionSweep } from './jobs/retention.job.js';

/**
 * Process entry point: connect, listen, and shut down cleanly.
 *
 * The shutdown sequence itself lives in `core/lifecycle.ts`, where it can be
 * tested — the one path that must work during an incident is the worst one to
 * leave unexercised.
 */

async function start(): Promise<void> {
  // Imported lazily so a config or DB failure is reported by this handler
  // rather than crashing during module evaluation.
  const { connectDatabase, disconnectDatabase } = await import('./core/db.js');

  await connectDatabase();

  const app = createApp();
  const server: Server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
  });

  // Housekeeping: TTL expiry removes an application record but knows nothing
  // about the CV beside it (ROADMAP 6.5). The timer is unref'd, so it never
  // delays a shutdown.
  startRetentionSweep();

  const lifecycle = createServerLifecycle(server, {
    onClose: disconnectDatabase,
    exit: (code) => {
      process.exit(code);
    },
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      lifecycle.shutdown(signal);
    });
  }

  /**
   * A rejection nobody handled is a bug, and one that reaches here has already
   * escaped every route's error handling — so it is reported and the process
   * is brought down deliberately rather than left in an unknown state.
   */
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    captureError({ error: reason });
    lifecycle.shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    captureError({ error });
    lifecycle.shutdown('uncaughtException');
  });
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to start');
  captureError({ error });
  process.exit(1);
});
