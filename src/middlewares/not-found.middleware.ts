import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../core/errors.js';

/**
 * Terminal handler for unmatched routes.
 *
 * It hands a NotFoundError to the error middleware rather than responding
 * itself, so an unknown path returns exactly the same body shape as any other
 * 404 the API produces.
 */
export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError('Route'));
}
