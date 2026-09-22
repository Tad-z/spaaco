import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { TEST_ACCESS_SECRET } from './test-env.js';

/**
 * Signs access tokens for tests.
 *
 * Real tokens signed with the real secret, not a stubbed verifier: the point
 * of a preview test is that verification actually happens, so a test that
 * bypassed it would prove nothing.
 */
export interface TokenClaims {
  readonly sub?: string;
  readonly roles?: string[];
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
  return jwt.sign({ sub: new Types.ObjectId().toString(), roles: ['admin'] }, 'a-different-secret-entirely', {
    expiresIn: '5m',
  });
}

export const expiredToken = (): string =>
  jwt.sign({ sub: new Types.ObjectId().toString(), roles: ['admin'] }, TEST_ACCESS_SECRET, {
    expiresIn: '-1s',
  });
