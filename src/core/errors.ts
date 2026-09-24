import type { ErrorCode, ErrorDetail, ErrorResponse } from '../types/api.js';

/**
 * The error hierarchy the API throws.
 *
 * Only the error middleware turns these into HTTP responses, so a service can
 * throw `new NotFoundError('Practice area')` without knowing anything about
 * Express. `code` and the response shape come from the OpenAPI spec, so an
 * error body that drifts from the contract fails `npm run typecheck`.
 */

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;

  /** Field-level problems, surfaced to the client. Never used for 500s. */
  readonly details?: readonly ErrorDetail[];

  /**
   * True for errors we raised deliberately. An unexpected throw is not
   * operational, and the error middleware refuses to leak its message.
   */
  readonly isOperational = true;

  constructor(message: string, details?: readonly ErrorDetail[]) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace(this, new.target);
  }

  /** The exact body sent to the client. */
  toResponse(): ErrorResponse {
    const error: ErrorResponse['error'] = { code: this.code, message: this.message };
    if (this.details !== undefined && this.details.length > 0) {
      error.details = [...this.details];
    }
    return { error };
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message = 'Invalid request', details?: readonly ErrorDetail[]) {
    super(message, details);
  }
}

export class UnauthenticatedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHENTICATED';

  constructor(message = 'Authentication required', details?: readonly ErrorDetail[]) {
    super(message, details);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(
    message = 'You do not have access to this resource',
    details?: readonly ErrorDetail[]
  ) {
    super(message, details);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  /** `subject` names the thing that was missing, e.g. `new NotFoundError('Insight')`. */
  constructor(subject = 'Resource') {
    super(`${subject} not found`);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';

  constructor(
    message = 'The request conflicts with the current state',
    details?: readonly ErrorDetail[]
  ) {
    super(message, details);
  }
}

export class PayloadTooLargeError extends AppError {
  readonly statusCode = 413;
  readonly code = 'PAYLOAD_TOO_LARGE';

  constructor(message = 'The uploaded file is too large') {
    super(message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  readonly statusCode = 415;
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';

  constructor(message = 'Unsupported file type') {
    super(message);
  }
}

/**
 * A file was inspected and refused — today, it failed the virus scan.
 * Deliberately not a 400: the fields were fine, the file was not.
 */
export class FileRejectedError extends AppError {
  readonly statusCode = 422;
  readonly code = 'FILE_REJECTED';

  constructor(message = 'The uploaded file could not be accepted') {
    super(message);
  }
}

/**
 * A write that needs `If-Match` arrived without it.
 *
 * 428 rather than 400 because nothing about the request is malformed — it is
 * the precondition that is missing, and the client's fix is to read the record
 * and resend, not to correct a field. The code stays `VALIDATION_ERROR`, as the
 * spec's own example of this response does, so the error enum is unchanged.
 */
export class PreconditionRequiredError extends AppError {
  readonly statusCode = 428;
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message = 'An If-Match header carrying the current revision is required',
    details?: ErrorDetail[]
  ) {
    super(message, details);
  }
}

export class RateLimitedError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';

  constructor(message = 'Too many requests. Please try again shortly.') {
    super(message);
  }
}

/**
 * Raised deliberately when something downstream fails. The message is for logs
 * only; the error middleware replaces it before responding, so an internal
 * detail can never reach a client.
 */
export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = 'INTERNAL';

  constructor(message = 'Something went wrong') {
    super(message);
  }
}

/** The body sent for any non-operational error. It never varies. */
export const GENERIC_INTERNAL_RESPONSE: ErrorResponse = {
  error: { code: 'INTERNAL', message: 'Something went wrong' },
};

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
