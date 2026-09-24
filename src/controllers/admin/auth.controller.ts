import type { CookieOptions, Request, Response } from 'express';
import { UnauthenticatedError } from '../../core/errors.js';
import { AUTH } from '../../config/constants.js';
import { config } from '../../config/env.js';
import {
  changePassword,
  getUserById,
  login,
  logout,
  refresh,
  updateProfile,
} from '../../services/auth.service.js';
import type { SessionTokens } from '../../services/auth.service.js';
import { toAdminUser } from '../../serializers/user.serializer.js';
import { readBody } from '../../middlewares/validate.middleware.js';
import {
  loginBody,
  passwordChangeBody,
  profileUpdateBody,
} from '../../validators/auth.validator.js';

/**
 * Admin auth endpoints.
 *
 * The refresh token is only ever a cookie: httpOnly so dashboard script cannot
 * read it, SameSite=Strict so it is not sent cross-site, and scoped to the
 * auth path so it is not attached to ordinary admin requests.
 */

const refreshCookieOptions = (expires: Date): CookieOptions => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production' || config.NODE_ENV === 'staging',
  sameSite: 'strict',
  path: AUTH.refreshCookiePath,
  expires,
});

function setRefreshCookie(res: Response, tokens: SessionTokens): void {
  res.cookie(
    AUTH.refreshCookieName,
    tokens.refreshToken,
    refreshCookieOptions(tokens.refreshExpiresAt)
  );
}

const readRefreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies[AUTH.refreshCookieName];
  return typeof value === 'string' ? value : undefined;
};

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const body = readBody(req, loginBody);
  const { user, tokens } = await login(body);

  setRefreshCookie(res, tokens);
  res.json({
    data: {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: toAdminUser(user),
    },
  });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const presented = readRefreshCookie(req);
  if (presented === undefined) throw new UnauthenticatedError('Session expired');

  const { user, tokens } = await refresh(presented);

  setRefreshCookie(res, tokens);
  res.json({
    data: {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: toAdminUser(user),
    },
  });
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  await logout(readRefreshCookie(req));

  res.clearCookie(AUTH.refreshCookieName, { path: AUTH.refreshCookiePath });
  res.status(204).end();
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  // requireAuth guarantees req.user, but the type does not, and an unchecked
  // assertion here would be the one place a missing middleware went unnoticed.
  if (!req.user) throw new UnauthenticatedError();

  const user = await getUserById(req.user.id);
  if (!user) throw new UnauthenticatedError();

  res.json({ data: toAdminUser(user) });
}

export async function updateProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const body = readBody(req, profileUpdateBody);
  const updated = await updateProfile(req.user.id, body);

  res.json({ data: toAdminUser(updated) });
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const body = readBody(req, passwordChangeBody);
  await changePassword(req.user.id, body.currentPassword, body.newPassword);

  // Every session is gone, including this one, so drop the cookie too.
  res.clearCookie(AUTH.refreshCookieName, { path: AUTH.refreshCookiePath });
  res.status(204).end();
}
