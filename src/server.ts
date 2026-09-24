import type { Server } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './core/logger.js';
import { createServerLifecycle } from './core/lifecycle.js';
import { startRetentionSweep } from './jobs/retention.job.js';
import { ensureRoleAccounts } from './services/bootstrap.service.js';

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

  // One account per role, created from the environment if they are not there
  // yet (ADR-043). Existing accounts are never touched, so a restart cannot
  // reset a password the firm has changed.
  await ensureRoleAccounts();

  // Said on every start, not once at deploy: an accepted risk that nobody is
  // reminded of stops being an accepted risk and becomes an oversight.
  if (config.NODE_ENV === 'production' && config.VIRUS_SCAN_DRIVER === 'noop') {
    logger.warn(
      'CV uploads are NOT being scanned for malware (ALLOW_UNSCANNED_UPLOADS=true). ' +
        'Set VIRUS_SCAN_DRIVER=clamav when a scanner is available.'
    );
  }

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
   * escaped every route's error handling — so the process is brought down
   * deliberately rather than left in an unknown state.
   */
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    lifecycle.shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    lifecycle.shutdown('uncaughtException');
  });
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
