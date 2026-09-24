import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AppError } from '../core/errors.js';
import {
  ConflictError,
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
 * Mongoose's document validation error.
 *
 * Reaching here means a value passed the Zod schema but failed the model —
 * which is a bug or an input the validator does not bound, and either way a
 * 400 is a truer answer than the 500 it used to produce.
 */
interface MongooseValidationError {
  readonly name: string;
  readonly errors: Record<string, unknown>;
}

const asMongooseValidationError = (error: unknown): MongooseValidationError | undefined =>
  error instanceof Error &&
  error.name === 'ValidationError' &&
  'errors' in error &&
  typeof (error as { errors: unknown }).errors === 'object'
    ? (error as unknown as MongooseValidationError)
    : undefined;

/** MongoDB's duplicate-key error, which the driver raises with code 11000. */
interface DuplicateKeyError {
  readonly code: number;
  readonly keyValue?: Record<string, unknown>;
}

const asDuplicateKeyError = (error: unknown): DuplicateKeyError | undefined =>
  error instanceof Error && 'code' in error && (error as { code: unknown }).code === 11000
    ? (error as unknown as DuplicateKeyError)
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

  const duplicate = asDuplicateKeyError(error);
  if (duplicate) {
    // Every unique index in this schema is a slug or an email, and both are
    // things an editor typed. Without this the driver's error reaches the
    // generic 500 handler, and "save" fails with "Something went wrong".
    const fields = Object.keys(duplicate.keyValue ?? {});

    return new ConflictError(
      fields.length === 1
        ? `That ${fields[0] ?? 'value'} is already taken. Choose another.`
        : 'That value is already taken. Choose another.',
      fields.map((field) => ({ path: field, message: 'already in use' }))
    );
  }

  const invalid = asMongooseValidationError(error);
  if (invalid) {
    // Mongoose's own message quotes the offending value — ``Path `userAgent`
    // (`<the whole header>`) is longer than...`` — so only the field names are
    // reported. The value came from the request and may be personal data; it
    // must not travel into a response, a log or an error report.
    return new ValidationError(
      'Some values were not acceptable',
      Object.keys(invalid.errors).map((path) => ({ path, message: 'invalid value' }))
    );
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

    // A 5xx is ours to explain in the log, never in the response: an
    // InternalError's message exists for the operator, and can quote an
    // upstream service verbatim (docs/API.md).
    res
      .status(appError.statusCode)
      .json(appError.statusCode >= 500 ? GENERIC_INTERNAL_RESPONSE : appError.toResponse());
    return;
  }

  logger.error({ err: error, requestId: req.requestId }, 'unhandled error');

  res.status(500).json(GENERIC_INTERNAL_RESPONSE);
}
