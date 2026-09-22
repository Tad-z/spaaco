import type { ValidatedData } from './common.js';

/**
 * Request augmentation.
 *
 * `validated` is populated by `validate()`, never by a controller, so a handler
 * that reads it can rely on the data having been parsed by Zod first.
 */
declare global {
  namespace Express {
    interface Request {
      /** Correlates every log line for one request. Echoed as `x-request-id`. */
      requestId: string;
      /** True only when `?preview=true` arrives with a valid admin token. */
      preview: boolean;
      /** Output of the route's Zod schemas. */
      validated: ValidatedData;
    }
  }
}

export {};
