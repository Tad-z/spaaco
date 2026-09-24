import type { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../core/errors.js';

/**
 * Requires `If-Match` on an admin write, carrying the revision that was read.
 *
 * Refusing the write when the header is missing is deliberate: without it, a
 * client that simply forgets the header would silently get last-write-wins,
 * which is the exact failure optimistic locking exists to prevent (ADR-015).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Revision parsed from the If-Match header. */
      ifMatch?: number;
    }
  }
}

export function ifMatch(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get('if-match');

  if (header === undefined || header.trim() === '') {
    next(
      new ValidationError('An If-Match header carrying the current revision is required', [
        { path: 'If-Match', message: 'required' },
      ])
    );
    return;
  }

  // Quoted ETag syntax is tolerated, since some clients add the quotes.
  const revision = Number(header.trim().replace(/^(W\/)?"|"$/g, ''));

  if (!Number.isInteger(revision) || revision < 0) {
    next(
      new ValidationError('If-Match must be the revision number read from the record', [
        { path: 'If-Match', message: 'must be a non-negative integer' },
      ])
    );
    return;
  }

  req.ifMatch = revision;
  next();
}
