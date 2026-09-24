import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { ForbiddenError, UnauthenticatedError } from '../core/errors.js';
import { getUserById } from '../services/auth.service.js';
import { bearerToken, verifyAccessToken } from './auth.middleware.js';
import { namedHandler } from '../helpers/named-handler.helper.js';
import type { UserRole } from '../types/api.js';

/**
 * Admin gatekeeping: deny by default.
 *
 * `requireAuth` verifies the token *and* reloads the user, so deactivating an
 * account or changing its roles takes effect immediately rather than when the
 * current access token happens to expire.
 *
 * Two-factor is enforced here, not per route, so no admin route can forget it.
 * The auth routes themselves are exempt, or a user could never enrol.
 */

export interface AuthenticatedUser {
  readonly id: Types.ObjectId;
  readonly roles: readonly UserRole[];
  readonly totpEnabled: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface RequireAuthOptions {
  /**
   * Allow a user who has not yet enrolled in two-factor. Only the auth routes
   * set this, so somebody can complete setup.
   */
  readonly allowWithoutTotp?: boolean;
}

export function requireAuth(options: RequireAuthOptions = {}): RequestHandler {
  const handler: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    const token = bearerToken(req);
    if (token === undefined) {
      next(new UnauthenticatedError());
      return;
    }

    const claims = verifyAccessToken(token);
    if (!claims || !Types.ObjectId.isValid(claims.sub)) {
      next(new UnauthenticatedError());
      return;
    }

    // Reload rather than trusting the token's claims: a token issued five
    // minutes ago must not keep working for an account disabled since.
    getUserById(new Types.ObjectId(claims.sub))
      .then((user) => {
        if (!user?.isActive) {
          next(new UnauthenticatedError());
          return;
        }

        // A token issued before the password last changed is dead, whatever
        // its expiry says. Otherwise a password changed *because* of a
        // compromise left the attacker's bearer token working for the rest of
        // its fifteen minutes — against the whole admin API, including reading
        // enquiries and minting CV links.
        if (issuedBefore(claims.iat, user.credentialsChangedAt)) {
          next(new UnauthenticatedError());
          return;
        }

        if (!user.totp.enabled && options.allowWithoutTotp !== true) {
          next(
            new ForbiddenError('Two-factor authentication must be enabled to use the admin API', [
              { path: 'totp', message: 'TOTP_REQUIRED' },
            ])
          );
          return;
        }

        req.user = { id: user._id, roles: user.roles, totpEnabled: user.totp.enabled };
        next();
      })
      .catch(next);
  };

  // Named so the route inventory can see the guard; see namedHandler.
  return namedHandler('requireAuth', handler);
}

/**
 * Whether a token predates the moment its user's credentials changed.
 *
 * `iat` is in whole seconds, so a token issued in the same second as the
 * change is treated as older — erring towards refusing a token that might be
 * valid rather than accepting one that might not be.
 */
function issuedBefore(iat: number | undefined, changedAt: Date | null | undefined): boolean {
  if (changedAt === null || changedAt === undefined) return false;
  if (iat === undefined) return true;

  return iat * 1000 <= changedAt.getTime();
}
