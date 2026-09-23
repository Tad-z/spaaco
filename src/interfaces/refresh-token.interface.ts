import type { Types } from 'mongoose';

/**
 * One issued refresh token.
 *
 * Stored as a SHA-256 hash: a leaked database dump must not yield usable
 * session tokens. `replacedBy` links the rotation chain, so a replayed token
 * can be traced forward and the whole chain revoked.
 */
export interface IRefreshToken {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}
