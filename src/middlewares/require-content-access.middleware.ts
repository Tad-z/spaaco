import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../core/errors.js';

/**
 * The content row of the role matrix in docs/API.md.
 *
 * `admin` and `editor` may work on every collection. `hr` is granted jobs
 * only, which a plain `requireRole` cannot express: the matrix is per *area*,
 * and for HR the area is narrower than the route.
 *
 * Deny by default, so a collection added later is closed to HR until someone
 * decides otherwise.
 */
const HR_COLLECTIONS = new Set(['jobs']);

export function requireContentAccess(req: Request, _res: Response, next: NextFunction): void {
  const roles = req.user?.roles ?? [];

  if (roles.includes('admin') || roles.includes('editor')) {
    next();
    return;
  }

  const collection = req.params.collection;

  if (roles.includes('hr') && typeof collection === 'string' && HR_COLLECTIONS.has(collection)) {
    next();
    return;
  }

  next(new ForbiddenError());
}
