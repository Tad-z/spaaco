import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import type { Types } from 'mongoose';
import { RefreshToken, User } from '../models/index.js';
import { config } from '../config/env.js';
import { AUTH } from '../config/constants.js';
import { ConflictError, ForbiddenError, UnauthenticatedError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { randomToken, sha256 } from '../helpers/hash.helper.js';
import { decryptSecret, encryptSecret } from '../helpers/crypto.helper.js';
import type { IUser } from '../interfaces/user.interface.js';
import type { UserRole } from '../types/api.js';

/**
 * Admin authentication.
 *
 * Three properties this is built around:
 *
 * 1. A wrong password and an unknown email are indistinguishable to a caller,
 *    so the login form cannot be used to enumerate who works at the firm.
 * 2. Refresh tokens rotate, and replaying a revoked one revokes the whole
 *    chain — the standard detection for a stolen token, since the thief and
 *    the real user cannot both keep using it.
 * 3. TOTP is mandatory for admin work, enforced in the middleware rather than
 *    here, so no route can forget it.
 */

export interface AccessTokenClaims {
  sub: string;
  roles: UserRole[];
}

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Seconds, parsed from the configured access-token lifetime. */
function accessTokenSeconds(): number {
  const ttl = config.JWT_ACCESS_TTL;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match?.[1] || !match[2]) return 900;

  const amount = Number(match[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2]] ?? 60;
  return amount * unit;
}

export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id });

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed stored hash is a failed verification, not a crash.
    return false;
  }
}

function signAccessToken(user: Pick<IUser, '_id' | 'roles'>): string {
  const claims: AccessTokenClaims = { sub: user._id.toString(), roles: user.roles };
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, { expiresIn: accessTokenSeconds() });
}

async function issueRefreshToken(
  userId: Types.ObjectId
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  await RefreshToken.create({ user: userId, tokenHash: sha256(token), expiresAt });

  return { token, expiresAt };
}

async function issueSession(user: IUser): Promise<SessionTokens> {
  const { token, expiresAt } = await issueRefreshToken(user._id);

  return {
    accessToken: signAccessToken(user),
    expiresIn: accessTokenSeconds(),
    refreshToken: token,
    refreshExpiresAt: expiresAt,
  };
}

/** The same error for a wrong password and an unknown email. */
const invalidCredentials = (): UnauthenticatedError =>
  new UnauthenticatedError('Invalid email or password');

async function registerFailure(user: IUser): Promise<void> {
  const failedLoginCount = user.failedLoginCount + 1;
  const locked = failedLoginCount >= AUTH.maxFailedLogins;

  await User.updateOne(
    { _id: user._id },
    {
      failedLoginCount,
      ...(locked ? { lockedUntil: new Date(Date.now() + AUTH.lockoutMs) } : {}),
    }
  );

  if (locked)
    logger.warn({ userId: user._id.toString() }, 'account locked after repeated failures');
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly totp?: string;
}

export async function login(input: LoginInput): Promise<{ user: IUser; tokens: SessionTokens }> {
  const user = await User.findOne({ email: input.email.toLowerCase() })
    .select('+passwordHash +totp.secretEncrypted')
    .lean<IUser | null>();

  // Verify a dummy hash when the user does not exist, so a missing account and
  // a wrong password take about the same time to answer.
  if (!user) {
    await verifyPassword(
      '$argon2id$v=19$m=65536,t=3,p=4$0000000000000000$0000000000000000',
      input.password
    );
    throw invalidCredentials();
  }

  // The password is checked *before* the account's state, and every failure
  // answers the same 401.
  //
  // The order matters more than it looks. Answering "this account is disabled"
  // or "temporarily locked" before checking the password turns the login form
  // into a directory: one request per candidate address tells an outsider who
  // works at the firm, and the staff are named on this very site, so guessing
  // the address format is easy. It also made a denial-of-service trivial —
  // ten wrong passwords lock an account for fifteen minutes, and the locked
  // response confirmed the attack was working.
  const passwordMatches = await verifyPassword(user.passwordHash, input.password);

  if (!passwordMatches) {
    // Only a real account with a wrong password counts towards a lockout, so
    // the counter cannot be driven by guessing at addresses.
    if (user.isActive) await registerFailure(user);
    throw invalidCredentials();
  }

  // Past this point the caller has proved they hold the password, so telling
  // them the state of their own account discloses nothing they do not know.
  if (!user.isActive) throw new ForbiddenError('This account is disabled');

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ForbiddenError('This account is temporarily locked. Try again later.');
  }

  if (user.totp.enabled) {
    if (input.totp === undefined) {
      // A distinct signal, so the dashboard prompts for a code rather than
      // telling the user their password was wrong.
      throw new UnauthenticatedError('A two-factor code is required', [
        { path: 'totp', message: 'TOTP_REQUIRED' },
      ]);
    }
    if (!verifyTotp(user, input.totp)) {
      await registerFailure(user);
      throw invalidCredentials();
    }
  }

  await User.updateOne(
    { _id: user._id },
    { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }
  );

  return { user, tokens: await issueSession(user) };
}

/** Revoke every token in a chain, forwards from the one presented. */
async function revokeChain(tokenId: Types.ObjectId): Promise<void> {
  const seen = new Set<string>();
  let current: Types.ObjectId | null = tokenId;

  while (current !== null && !seen.has(current.toString())) {
    seen.add(current.toString());
    const doc: { replacedBy?: Types.ObjectId | null } | null = await RefreshToken.findOneAndUpdate(
      { _id: current },
      { revokedAt: new Date() }
    ).lean<{ replacedBy?: Types.ObjectId | null } | null>();

    current = doc?.replacedBy ?? null;
  }
}

export async function refresh(presented: string): Promise<{ user: IUser; tokens: SessionTokens }> {
  const tokenHash = sha256(presented);

  /**
   * Claim the token and revoke it in one atomic operation.
   *
   * The revocation *is* the claim, which is what makes reuse detectable. Read,
   * then issue, then revoke — the obvious order — let two simultaneous
   * presentations of the same token both pass the `revokedAt` check, so a
   * stolen token used alongside the real one produced two live chains and no
   * detection at all. Here exactly one of the two wins the update.
   */
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { revokedAt: new Date() },
    { new: false }
  ).lean<{ _id: Types.ObjectId; user: Types.ObjectId; expiresAt: Date } | null>();

  if (!claimed) {
    // Either no such token, or somebody already claimed it. The second case is
    // a replay: the token was stolen, or the real session is confused. Either
    // way the safe move is to end every session in the chain.
    const known = await RefreshToken.findOne({ tokenHash }).select('_id user').lean<{
      _id: Types.ObjectId;
      user: Types.ObjectId;
    } | null>();

    if (known) {
      logger.warn({ userId: known.user.toString() }, 'refresh token reuse detected');
      await revokeChain(known._id);
    }

    throw new UnauthenticatedError('Session expired');
  }

  if (claimed.expiresAt < new Date()) throw new UnauthenticatedError('Session expired');

  const user = await User.findById(claimed.user).lean<IUser | null>();
  if (!user?.isActive) throw new UnauthenticatedError('Session expired');

  const tokens = await issueSession(user);
  const replacement = await RefreshToken.findOne({ tokenHash: sha256(tokens.refreshToken) })
    .select('_id')
    .lean<{ _id: Types.ObjectId } | null>();

  await RefreshToken.updateOne({ _id: claimed._id }, { replacedBy: replacement?._id ?? null });

  return { user, tokens };
}

export async function logout(presented: string | undefined): Promise<void> {
  if (presented === undefined) return;
  await RefreshToken.updateOne({ tokenHash: sha256(presented) }, { revokedAt: new Date() });
}

/**
 * Invalidate every access token issued so far for this user.
 *
 * Revoking refresh tokens alone left the bearer token already issued working
 * for the rest of its fifteen minutes — so a password changed *because* of a
 * compromise did not actually end the compromise. `requireAuth` compares the
 * token's issue time against this, so the next request with an old token is
 * refused.
 */
export const invalidateAccessTokens = async (userId: Types.ObjectId): Promise<void> => {
  await User.updateOne({ _id: userId }, { credentialsChangedAt: new Date() });
};

export const revokeAllSessions = async (userId: Types.ObjectId): Promise<void> => {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
};

// --- two-factor -------------------------------------------------------------

export interface TotpSetupResult {
  secret: string;
  otpauthUrl: string;
}

export async function setupTotp(userId: Types.ObjectId): Promise<TotpSetupResult> {
  const user = await User.findById(userId).lean<IUser | null>();
  if (!user) throw new UnauthenticatedError();
  if (user.totp.enabled) throw new ConflictError('Two-factor authentication is already enabled');

  const secret = authenticator.generateSecret();

  // Stored but not enabled: an abandoned setup must not lock the user out.
  await User.updateOne(
    { _id: userId },
    { 'totp.secretEncrypted': encryptSecret(secret, config.ENCRYPTION_KEY) }
  );

  return {
    secret,
    otpauthUrl: authenticator.keyuri(user.email, 'SPA Ajibade & Co.', secret),
  };
}

function verifyTotp(user: Pick<IUser, 'totp'>, code: string): boolean {
  const encrypted = user.totp.secretEncrypted;
  if (encrypted === null || encrypted === undefined) return false;

  try {
    return authenticator.verify({
      token: code,
      secret: decryptSecret(encrypted, config.ENCRYPTION_KEY),
    });
  } catch {
    // A secret that will not decrypt means the key changed; treat as a failure
    // rather than crashing a login.
    return false;
  }
}

export async function enableTotp(userId: Types.ObjectId, code: string): Promise<void> {
  const user = await User.findById(userId).select('+totp.secretEncrypted').lean<IUser | null>();

  if (!user) throw new UnauthenticatedError();
  if (user.totp.enabled) throw new ConflictError('Two-factor authentication is already enabled');
  if (user.totp.secretEncrypted === null || user.totp.secretEncrypted === undefined) {
    throw new ConflictError('Start two-factor setup before enabling it');
  }
  if (!verifyTotp(user, code)) throw new UnauthenticatedError('That code is not valid');

  await User.updateOne({ _id: userId }, { 'totp.enabled': true });
}

export async function changePassword(
  userId: Types.ObjectId,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash').lean<IUser | null>();
  if (!user) throw new UnauthenticatedError();

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new UnauthenticatedError('Current password is incorrect');
  }

  await User.updateOne(
    {
      _id: userId,
    },
    { passwordHash: await hashPassword(newPassword), credentialsChangedAt: new Date() }
  );

  // A session opened with the old password must not survive the change —
  // neither the refresh chain nor the access token already issued.
  await revokeAllSessions(userId);
}

export const getUserById = (userId: Types.ObjectId): Promise<IUser | null> =>
  User.findById(userId).lean<IUser | null>();
