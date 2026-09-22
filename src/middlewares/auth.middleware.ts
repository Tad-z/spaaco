import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { logger } from '../core/logger.js';

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
    const payload: unknown = jwt.verify(token, config.JWT_ACCESS_SECRET);
    return isClaims(payload) ? payload : undefined;
  } catch {
    // An invalid or expired token is an ordinary condition on a public route.
    return undefined;
  }
}

export const bearerToken = (req: Request): string | undefined =>
  BEARER.exec(req.get('authorization') ?? '')?.[1];

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
  if (claims) {
    req.preview = true;
    logger.debug({ requestId: req.requestId, sub: claims.sub }, 'preview enabled');
  }

  next();
}
