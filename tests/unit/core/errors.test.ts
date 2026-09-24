import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  FileRejectedError,
  ForbiddenError,
  GENERIC_INTERNAL_RESPONSE,
  InternalError,
  isAppError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitedError,
  UnauthenticatedError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../../../src/core/errors.js';
import { formatErrors, getValidator, SPEC_ID } from '../../support/spec.js';

/**
 * Errors are part of the contract: every failure the frontend sees is one of
 * these. So as well as checking status and code, each serialised body is
 * validated against the spec's own ErrorResponse schema with ajv — the same
 * schema the response fixtures are checked against.
 */

const validateErrorResponse = getValidator(`${SPEC_ID}#/components/schemas/ErrorResponse`);

/** Every error type, with the status and code docs/API.md assigns it. */
const cases = [
  { name: 'ValidationError', error: new ValidationError(), status: 400, code: 'VALIDATION_ERROR' },
  {
    name: 'UnauthenticatedError',
    error: new UnauthenticatedError(),
    status: 401,
    code: 'UNAUTHENTICATED',
  },
  { name: 'ForbiddenError', error: new ForbiddenError(), status: 403, code: 'FORBIDDEN' },
  { name: 'NotFoundError', error: new NotFoundError(), status: 404, code: 'NOT_FOUND' },
  { name: 'ConflictError', error: new ConflictError(), status: 409, code: 'CONFLICT' },
  {
    name: 'PayloadTooLargeError',
    error: new PayloadTooLargeError(),
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
  },
  {
    name: 'UnsupportedMediaTypeError',
    error: new UnsupportedMediaTypeError(),
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
  },
  { name: 'FileRejectedError', error: new FileRejectedError(), status: 422, code: 'FILE_REJECTED' },
  { name: 'RateLimitedError', error: new RateLimitedError(), status: 429, code: 'RATE_LIMITED' },
  { name: 'InternalError', error: new InternalError(), status: 500, code: 'INTERNAL' },
] as const;

describe('AppError hierarchy', () => {
  it('has the spec schema available to validate against', () => {
    expect(validateErrorResponse).toBeDefined();
  });

  it.each(cases)('$name carries status $status and code $code', ({ error, status, code }) => {
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(code);
  });

  it.each(cases)('$name serialises to a body matching the spec', ({ error }) => {
    const body = error.toResponse();
    expect(validateErrorResponse).toBeDefined();
    if (!validateErrorResponse) return;

    const valid = validateErrorResponse(body);
    expect(valid, formatErrors(validateErrorResponse.errors)).toBe(true);
  });

  it.each(cases)('$name is recognised by isAppError', ({ error }) => {
    expect(isAppError(error)).toBe(true);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it.each(cases)('$name reports its own class name', ({ error, name }) => {
    expect(error.name).toBe(name);
  });

  it('treats a plain Error as not an AppError', () => {
    expect(isAppError(new Error('boom'))).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError({ statusCode: 400, code: 'VALIDATION_ERROR' })).toBe(false);
  });
});

describe('error details', () => {
  it('includes field details when given, and they match the spec shape', () => {
    const error = new ValidationError('Invalid request', [
      { path: 'email', message: 'Invalid email' },
      { path: 'summary', message: 'Must be at least 20 characters' },
    ]);

    const body = error.toResponse();

    expect(body.error.details).toEqual([
      { path: 'email', message: 'Invalid email' },
      { path: 'summary', message: 'Must be at least 20 characters' },
    ]);
    expect(validateErrorResponse?.(body)).toBe(true);
  });

  it('omits details entirely when there are none, rather than sending an empty array', () => {
    const body = new ValidationError().toResponse();

    expect('details' in body.error).toBe(false);
  });

  it('omits details when an empty array is passed', () => {
    const body = new ValidationError('Invalid request', []).toResponse();

    expect('details' in body.error).toBe(false);
  });

  it('copies details, so mutating the response cannot reach back into the error', () => {
    const details = [{ path: 'email', message: 'Invalid email' }];
    const error = new ValidationError('Invalid request', details);

    const body = error.toResponse();
    body.error.details?.push({ path: 'injected', message: 'should not persist' });

    expect(error.toResponse().error.details).toHaveLength(1);
  });
});

describe('error messages', () => {
  it('names the missing subject in a NotFoundError', () => {
    expect(new NotFoundError('Practice area').message).toBe('Practice area not found');
    expect(new NotFoundError().message).toBe('Resource not found');
  });

  it('uses the caller message when one is given', () => {
    expect(new ConflictError('Image is still in use').toResponse().error.message).toBe(
      'Image is still in use'
    );
  });

  it('keeps a stack trace for logging', () => {
    expect(new InternalError('mongo timed out').stack).toBeDefined();
  });
});

describe('GENERIC_INTERNAL_RESPONSE', () => {
  it('matches the spec and leaks nothing about the failure', () => {
    expect(validateErrorResponse?.(GENERIC_INTERNAL_RESPONSE)).toBe(true);
    expect(GENERIC_INTERNAL_RESPONSE).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });

  it('carries no details field that could expose internals', () => {
    expect('details' in GENERIC_INTERNAL_RESPONSE.error).toBe(false);
  });
});
