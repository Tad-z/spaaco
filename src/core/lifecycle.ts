import type { Server } from 'node:http';
import { logger } from './logger.js';

/**
 * Graceful shutdown, extracted so it can be tested.
 *
 * What it has to get right is an ordering: stop accepting connections, let the
 * requests already in flight finish, *then* close the database, and only then
 * exit. Closing the connection first is how a routine restart turns into a
 * page of 500s for the editor who was halfway through saving.
 *
 * It lived inline in `server.ts`, where nothing could reach it — and a
 * shutdown path that is never exercised is one you discover is broken during
 * the incident it was meant to smooth over.
 */

export interface LifecycleHooks {
  /** Release resources once no request needs them. Failures are logged. */
  readonly onClose: () => Promise<void>;
  /** Separated from `process.exit` so a test can observe the code. */
  readonly exit: (code: number) => void;
}

export interface ServerLifecycle {
  shutdown: (signal: string) => void;
  /** Resolves when the shutdown has run to completion. */
  readonly finished: Promise<void>;
}

/** How long a connection has to drain before it is abandoned. */
const DEFAULT_TIMEOUT_MS = 10_000;

export function createServerLifecycle(
  server: Server,
  hooks: LifecycleHooks,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): ServerLifecycle {
  let shuttingDown = false;
  let exited = false;
  let settle: () => void = () => undefined;

  /**
   * Exit once, whichever path gets there first.
   *
   * The drain and the deadline both end in an exit, and they are not mutually
   * exclusive — a connection that finishes draining just as the timer fires
   * would otherwise exit twice. Harmless against `process.exit`, but this
   * module exists to be injectable and tested.
   */
  const finish = (code: number): void => {
    if (exited) return;
    exited = true;

    hooks.exit(code);
    settle();
  };

  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const shutdown = (signal: string): void => {
    // A platform that sends SIGTERM and then SIGINT must not start two.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    server.close((closeError) => {
      if (closeError) logger.error({ err: closeError }, 'error closing server');

      void hooks
        .onClose()
        .catch((error: unknown) => {
          logger.error({ err: error }, 'error releasing resources during shutdown');
        })
        .finally(() => {
          finish(closeError ? 1 : 0);
        });
    });

    // A connection that refuses to drain must not hold the process open for
    // ever. This path deliberately skips `onClose`: whatever is hanging may be
    // the database call itself, so waiting on it again would turn a
    // ten-second shutdown into an indefinite one. The platform is about to
    // SIGKILL us regardless; exiting on our own terms is tidier.
    setTimeout(() => {
      logger.error({ timeoutMs }, 'forced shutdown after timeout');
      finish(1);
    }, timeoutMs).unref();
  };

  return { shutdown, finished };
}
