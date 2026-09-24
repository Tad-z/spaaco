import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { Types } from 'mongoose';
import { logger } from '../core/logger.js';
import { getUserById } from '../services/auth.service.js';
import { issuedBefore } from './require-auth.middleware.js';
import type { UserRole } from '../types/api.js';

/**
 * Token handling for public routes.
 *
 * `optionalPreviewAuth` is what lets the admin dashboard preview unpublished
 * content. Both halves are required: `?preview=true` **and** a valid admin
 * token. A bad or missing token is not an error here — the request simply
 * carries on seeing published content only, because these are public
 * endpoints. `requireAuth`, which does reject, arrives with the admin API.
 */

export interface AccessTokenClaims {
  sub: string;
  roles: string[];
  /** Issued-at, in seconds, added by `jwt.sign`. Compared against
   * `credentialsChangedAt` so a password change invalidates tokens already
   * issued. */
  iat?: number;
}

const BEARER = /^Bearer (.+)$/i;

const isClaims = (value: unknown): value is AccessTokenClaims =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AccessTokenClaims).sub === 'string' &&
  Array.isArray((value as AccessTokenClaims).roles);

/** Verify an access token, returning its claims or undefined. */
export function verifyAccessToken(token: string): AccessTokenClaims | undefined {
  try {
    // The algorithm is pinned. With a string secret jsonwebtoken already
    // restricts itself to HMAC, so there is no confusion path today — but that
    // is a property of the key type, and the key type is one refactor away
    // from being a KeyObject.
    const payload: unknown = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    });
    return isClaims(payload) ? payload : undefined;
  } catch {
    // An invalid or expired token is an ordinary condition on a public route.
    return undefined;
  }
}

export const bearerToken = (req: Request): string | undefined =>
  BEARER.exec(req.get('authorization') ?? '')?.[1];

/**
 * Roles that may see unpublished content.
 *
 * Preview is a content permission, so it follows the content half of the role
 * matrix: `business_dev` handles enquiries and has no business reading an
 * embargoed insight or an unannounced hire.
 */
const PREVIEW_ROLES = new Set<UserRole>(['admin', 'editor', 'hr']);

/**
 * Optional preview on a public GET.
 *
 * A signature-valid token is *not* enough, and that was a real hole: `login`
 * issues an access token before TOTP enrolment, so a phished password alone
 * — no second factor — read every draft on the site through `?preview=true`.
 * A deactivated account kept the same access for the life of its token, and a
 * role with no content permission had it too.
 *
 * So this reloads the user, exactly as `requireAuth` does, and grants preview
 * only to an active, enrolled, content-capable account. Failure is silent by
 * design: preview is optional, and the request simply proceeds as the public.
 */
export function optionalPreviewAuth(req: Request, _res: Response, next: NextFunction): void {
  req.preview = false;

  if (req.query.preview !== 'true') {
    next();
    return;
  }

  const token = bearerToken(req);
  if (token === undefined) {
    next();
    return;
  }

  const claims = verifyAccessToken(token);
  if (!claims || !Types.ObjectId.isValid(claims.sub)) {
    next();
    return;
  }

  getUserById(new Types.ObjectId(claims.sub))
    .then((user) => {
      const permitted =
        user !== null &&
        user.isActive &&
        user.totp.enabled &&
        // The same rule `requireAuth` applies: without it, a password changed
        // because of a compromise ended the compromise for the admin API and
        // left every draft readable for the rest of the token's fifteen
        // minutes.
        !issuedBefore(claims.iat, user.credentialsChangedAt) &&
        user.roles.some((role) => PREVIEW_ROLES.has(role));

      if (permitted) {
        req.preview = true;
        logger.debug({ requestId: req.requestId, sub: claims.sub }, 'preview enabled');
      }

      next();
    })
    .catch(next);
}
