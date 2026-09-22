import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AppError } from '../core/errors.js';
import {
  GENERIC_INTERNAL_RESPONSE,
  PayloadTooLargeError,
  ValidationError,
  isAppError,
} from '../core/errors.js';
import { toErrorDetails } from './validate.middleware.js';
import { logger } from '../core/logger.js';

/**
 * The only place an error becomes an HTTP response.
 *
 * Operational errors (everything in the AppError hierarchy) answer with their
 * own status, code and message. Anything else is a bug or a failure we did not
 * anticipate, so the client gets a fixed 500 body and the detail goes to the
 * log — a stack trace or a driver message must never reach a client.
 */

interface BodyParserError extends Error {
  readonly status?: number;
  readonly statusCode?: number;
  readonly type?: string;
  readonly body?: unknown;
}

const asBodyParserError = (error: unknown): BodyParserError | undefined =>
  error instanceof Error && ('type' in error || 'status' in error || 'statusCode' in error)
    ? (error as BodyParserError)
    : undefined;

/**
 * Translate the errors thrown before our own code runs — body-parser and Zod —
 * into the hierarchy, so they are reported like everything else.
 */
function normalise(error: unknown): AppError | undefined {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new ValidationError('Invalid request', toErrorDetails(error));
  }

  const parserError = asBodyParserError(error);
  if (!parserError) return undefined;

  // express.json() rejecting a body larger than the configured limit.
  if (parserError.type === 'entity.too.large') {
    return new PayloadTooLargeError('Request body is too large');
  }

  // express.json() failing to parse: a SyntaxError carrying the raw body.
  if (error instanceof SyntaxError && 'body' in parserError) {
    return new ValidationError('Malformed JSON body', [
      { path: 'body', message: 'Request body is not valid JSON' },
    ]);
  }

  return undefined;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Express 5 still requires the 4-arity signature to register this as an error
  // handler, and delegates if a response has already started.
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalise(error);

  if (appError) {
    if (appError.statusCode >= 500) {
      logger.error({ err: appError, requestId: req.requestId }, 'request failed');
    } else {
      logger.debug(
        { code: appError.code, status: appError.statusCode, requestId: req.requestId },
        'request rejected'
      );
    }

    res.status(appError.statusCode).json(appError.toResponse());
    return;
  }

  logger.error({ err: error, requestId: req.requestId }, 'unhandled error');
  res.status(500).json(GENERIC_INTERNAL_RESPONSE);
}
