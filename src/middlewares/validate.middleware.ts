import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ValidationError } from '../core/errors.js';
import { zodIssueDetails } from '../helpers/zod-issues.helper.js';
import { namedHandler } from '../helpers/named-handler.helper.js';
import type { ErrorDetail } from '../types/api.js';

/**
 * Request validation.
 *
 * Every body, query and param reaching a controller has been through a Zod
 * schema here first. Parsed output replaces the raw input on `req.validated`,
 * so controllers work with coerced, trimmed, defaulted values and never touch
 * `req.query` directly.
 */

export interface ValidationSchemas {
  readonly body?: ZodTypeAny;
  readonly query?: ZodTypeAny;
  readonly params?: ZodTypeAny;
}

/**
 * Flatten a ZodError into the `details` array the spec defines.
 *
 * Re-exported rather than defined here: the singleton services validate a
 * merged document outside any middleware, and both paths must format issues
 * identically.
 */
export const toErrorDetails = zodIssueDetails;

export function validate(schemas: ValidationSchemas): RequestHandler {
  const handler: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    const details: ErrorDetail[] = [];
    const validated: { body: unknown; query: unknown; params: unknown } = {
      body: undefined,
      query: undefined,
      params: undefined,
    };

    for (const part of ['body', 'query', 'params'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (result.success) {
        validated[part] = result.data;
      } else {
        // Collect every part's problems before failing, so a request with a bad
        // query *and* a bad body gets told about both at once.
        details.push(...toErrorDetails(result.error, part === 'body' ? undefined : part));
      }
    }

    if (details.length > 0) {
      next(new ValidationError('Invalid request', details));
      return;
    }

    req.validated = validated;
    next();
  };

  return namedHandler('validate', handler);
}

/**
 * Typed access to validated data.
 *
 * The schema is passed again purely to carry its type: `z.infer<T>` resolves to
 * the schema's real output type at the call site, so `readParams(req, slugParams)`
 * is fully typed without an `as` cast and without re-running a parse that
 * `validate()` has already done. The argument is unused at runtime, hence the
 * underscore.
 */
export function readBody<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.validated.body;
}

export function readQuery<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.validated.query;
}

export function readParams<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.validated.params;
}
