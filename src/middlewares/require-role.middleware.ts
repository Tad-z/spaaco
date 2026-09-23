import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../core/errors.js';
import type { UserRole } from '../types/api.js';

/**
 * Role checks, applied after `requireAuth`.
 *
 * Deny by default: a route with no `requireRole` is reachable by any
 * authenticated admin user, so every admin router states its roles explicitly.
 * `admin` passes every check without being listed, since it is the superset.
 */
export function requireRole(...allowed: readonly UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      // requireAuth should have run first; reaching here is a wiring mistake.
      next(new UnauthenticatedError());
      return;
    }

    const permitted =
      user.roles.includes('admin') || allowed.some((role) => user.roles.includes(role));

    if (!permitted) {
      next(new ForbiddenError());
      return;
    }

    next();
  };
}
