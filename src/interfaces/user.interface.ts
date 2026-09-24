import type { Types } from 'mongoose';
import type { UserRole } from '../types/api.js';

/**
 * An admin account.
 *
 * The TOTP secret is stored encrypted rather than hashed, because it must be
 * readable to verify a code. `enabled` stays false until the user proves
 * enrolment, so an abandoned setup cannot lock anyone out of their own account.
 */
export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  roles: UserRole[];
  totp: {
    secretEncrypted?: string | null;
    enabled: boolean;
  };
  isActive: boolean;
  lastLoginAt?: Date | null;
  /**
   * When the password last changed.
   *
   * An access token issued before this moment is refused, so revoking the
   * refresh chain is not the only thing a password change accomplishes — the
   * bearer token already in an attacker's hands stops working too.
   */
  credentialsChangedAt?: Date | null;
  /** Reset on success; drives the lockout. */
  failedLoginCount: number;
  lockedUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
