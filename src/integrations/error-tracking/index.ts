import { config } from '../../config/env.js';
import { noopErrorTracker } from './noop.driver.js';
import { createSentryTracker, parseSentryDsn } from './sentry.driver.js';
import type { IErrorTracker } from '../../interfaces/integrations/error-tracking.interface.js';

/**
 * Picks the error tracker from config.
 *
 * Optional by design: `SENTRY_DSN` unset means the noop driver, so nothing
 * about running this API depends on having a Sentry account.
 */
export function createErrorTracker(): IErrorTracker {
  if (config.SENTRY_DSN === undefined) return noopErrorTracker;

  return createSentryTracker(
    parseSentryDsn(config.SENTRY_DSN),
    config.NODE_ENV,
    config.RELEASE ?? 'unknown'
  );
}
