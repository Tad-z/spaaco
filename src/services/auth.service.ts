import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { RefreshToken, User } from '../models/index.js';
import { config } from '../config/env.js';
import { AUTH } from '../config/constants.js';
import { ForbiddenError, UnauthenticatedError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { randomToken, sha256 } from '../helpers/hash.helper.js';
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

/**
 * Count a failed attempt, and lock the account once there are enough.
 *
 * The count resets when a previous lockout has expired, which makes a lockout
 * a fifteen-minute event rather than a latch. Without that reset the counter
 * stayed at ten for ever, so one wrong password every fifteen minutes kept an
 * account locked indefinitely — a denial of service anybody could run against
 * a named partner, using an address format guessed from the website.
 */
async function registerFailure(user: IUser): Promise<void> {
  const lockExpired = user.lockedUntil !== null && (user.lockedUntil?.getTime() ?? 0) <= Date.now();
  const previous = lockExpired ? 0 : user.failedLoginCount;

  const failedLoginCount = previous + 1;
  const locked = failedLoginCount >= AUTH.maxFailedLogins;

  await User.updateOne(
    { _id: user._id },
    {
      failedLoginCount,
      lockedUntil: locked ? new Date(Date.now() + AUTH.lockoutMs) : null,
    }
  );

  if (locked)
    logger.warn({ userId: user._id.toString() }, 'account locked after repeated failures');
}

export interface LoginInput {
  readonly username: string;
  readonly password: string;
}

export async function login(input: LoginInput): Promise<{ user: IUser; tokens: SessionTokens }> {
  const user = await User.findOne({ username: input.username.toLowerCase() })
    .select('+passwordHash')
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
  // The usernames here are guessable by design — they are the role names — so
  // the enumeration risk the ordering originally guarded against is smaller
  // than it was. The ordering stays because the other half still bites: with
  // the state checked first, ten wrong guesses lock a role out for fifteen
  // minutes and the response confirms the attack is working.
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

/**
 * Reload a user for an authenticated request.
 *
 * Projected rather than whole: this runs on every admin call and every
 * preview, and the callers need five fields between them.
 */
export const getUserById = (userId: Types.ObjectId): Promise<IUser | null> =>
  User.findById(userId)
    .select('_id username name email roles isActive credentialsChangedAt')
    .lean<IUser | null>();

export interface ProfileUpdate {
  readonly name?: string;
  readonly email?: string | null;
}

/**
 * Update your own display name and notification address.
 *
 * `email` is not a credential here — it is where this role's notifications go,
 * which is why the holder sets it themselves rather than an administrator
 * setting it for them (ADR-043).
 */
export async function updateProfile(userId: Types.ObjectId, input: ProfileUpdate): Promise<IUser> {
  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: input },
    { new: true }
  ).lean<IUser | null>();

  if (!updated) throw new UnauthenticatedError();

  return updated;
}
