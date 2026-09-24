import { config } from '../../config/env.js';
import { noopRevalidator } from './noop.driver.js';
import { createHttpRevalidator } from './http.driver.js';
import type { IRevalidator } from '../../interfaces/integrations/revalidate.interface.js';

/**
 * Picks the revalidation driver from config.
 *
 * `config/env.ts` already refuses to start with `REVALIDATE_DRIVER=http` and no
 * URL or secret, so by the time this runs the credentials are present.
 */
export function createRevalidator(): IRevalidator {
  if (
    config.REVALIDATE_DRIVER === 'http' &&
    config.FRONTEND_REVALIDATE_URL !== undefined &&
    config.FRONTEND_REVALIDATE_SECRET !== undefined
  ) {
    return createHttpRevalidator(config.FRONTEND_REVALIDATE_URL, config.FRONTEND_REVALIDATE_SECRET);
  }

  return noopRevalidator;
}
