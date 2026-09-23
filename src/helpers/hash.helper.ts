import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Hashing for values that must be looked up but never read back.
 *
 * Refresh tokens are stored hashed so a database dump yields no usable
 * sessions, and IP addresses are stored hashed so a submission cannot be tied
 * back to an address (NDPA data minimisation).
 */

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** Salted, so the same address does not hash alike across deployments. */
export const hashIp = (ip: string, salt: string): string => sha256(`${ip}:${salt}`);

/** A 256-bit URL-safe token. */
export const randomToken = (): string => randomBytes(32).toString('base64url');

/** Constant-time comparison, so a value cannot be guessed by timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
