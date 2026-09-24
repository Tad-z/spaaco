import { logger } from '../../core/logger.js';
import type { IRevalidator } from '../../interfaces/integrations/revalidate.interface.js';

/**
 * POSTs the changed tags to the frontend, which maps them to its own
 * revalidation (ADR-007, Q7).
 *
 * The request is bounded by a timeout: a hanging frontend must not hold an
 * admin write open, and the caller treats failure as non-fatal anyway.
 */
const TIMEOUT_MS = 5000;

export function createHttpRevalidator(url: string, secret: string): IRevalidator {
  return {
    name: 'http',
    revalidate: async (tags) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
          body: JSON.stringify({ tags }),
          signal: controller.signal,
        });

        if (!response.ok) {
          logger.error({ status: response.status, tags }, 'frontend rejected the revalidation');
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
