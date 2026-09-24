import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { TEST_ACCESS_SECRET } from './test-env.js';
import { User } from '../../src/models/index.js';
import { hashPassword } from '../../src/services/auth.service.js';
import type { IUser } from '../../src/interfaces/user.interface.js';
import type { UserRole } from '../../src/types/api.js';

/**
 * Signs access tokens for tests.
 *
 * Real tokens signed with the real secret, not a stubbed verifier: the point
 * of a preview test is that verification actually happens, so a test that
 * bypassed it would prove nothing.
 */
export interface TokenClaims {
  readonly sub?: string;
  readonly roles?: UserRole[];
  /** Taken from jsonwebtoken, which types its duration strings precisely. */
  readonly expiresIn?: jwt.SignOptions['expiresIn'];
}

export function signAccessToken(claims: TokenClaims = {}): string {
  return jwt.sign(
    { sub: claims.sub ?? new Types.ObjectId().toString(), roles: claims.roles ?? ['admin'] },
    TEST_ACCESS_SECRET,
    { expiresIn: claims.expiresIn ?? '5m' }
  );
}

/** A token signed with the wrong key: structurally valid, cryptographically not. */
export function signWithWrongSecret(): string {
  return jwt.sign(
    { sub: new Types.ObjectId().toString(), roles: ['admin'] },
    'a-different-secret-entirely',
    {
      expiresIn: '5m',
    }
  );
}

export const expiredToken = (): string =>
  jwt.sign({ sub: new Types.ObjectId().toString(), roles: ['admin'] }, TEST_ACCESS_SECRET, {
    expiresIn: '-1s',
  });

/**
 * Creates a real admin user and returns a real token for it.
 *
 * Two-factor is enabled by default, because `requireAuth` refuses any admin
 * route without it — a helper that left it off would make every test look like
 * a 403 bug.
 */
export interface TestUserOptions {
  readonly roles?: UserRole[];
  readonly totpEnabled?: boolean;
  readonly isActive?: boolean;
  readonly email?: string;
  readonly password?: string;
}

export const TEST_PASSWORD = 'a-correct-horse-battery-staple';

export async function createTestUser(
  options: TestUserOptions = {}
): Promise<{ user: IUser; token: string }> {
  const created = await User.create({
    name: 'Test User',
    email: options.email ?? `user-${new Types.ObjectId().toString()}@spaajibade.test`,
    passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
    roles: options.roles ?? ['admin'],
    isActive: options.isActive ?? true,
    totp: { enabled: options.totpEnabled ?? true, secretEncrypted: null },
  });

  const user = created.toObject<IUser>();
  return { user, token: signAccessToken({ sub: user._id.toString(), roles: user.roles }) };
}

/**
 * A token that actually grants preview.
 *
 * `signAccessToken()` alone no longer does: preview reloads the user and
 * requires an active, TOTP-enrolled, content-capable account, so a
 * signature-valid token with nothing behind it is treated as anonymous. Tests
 * about preview want a real editor; tests about *refusing* preview still use
 * the bare signer.
 */
export async function previewToken(): Promise<string> {
  const { token } = await createTestUser({ roles: ['editor'] });
  return token;
}
