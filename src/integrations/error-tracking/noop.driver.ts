import type { IErrorTracker } from '../../interfaces/integrations/error-tracking.interface.js';

/**
 * The default when no DSN is configured: report nowhere.
 *
 * The error is still logged by the error middleware, which is the whole story
 * in development. Nothing here needs a credential, so the API runs and the
 * suite passes with no Sentry account in existence.
 */
export const noopErrorTracker: IErrorTracker = {
  name: 'noop',
  capture(): void {
    // Intentionally nothing.
  },
};
