import { logger } from '../../core/logger.js';
import type { IRevalidator } from '../../interfaces/integrations/revalidate.interface.js';

/** The dev and test default: logs the tags and does nothing else. */
export const noopRevalidator: IRevalidator = {
  name: 'noop',
  revalidate: (tags) => {
    logger.debug({ tags }, 'revalidation skipped (noop driver)');
    return Promise.resolve();
  },
};
