import type { Types } from 'mongoose';
import type { UserRole } from '../types/api.js';

/**
 * An admin account.
 *
 * One per role, created at first boot from the deployment's environment
 * (ADR-043). `username` is the credential — `admin`, `editor`, `hr`,
 * `business_dev` — and `email` is a profile field the holder sets themselves,
 * used to address the notifications their role receives.
 */
export interface IUser {
  _id: Types.ObjectId;
  /** The login identifier. Lowercase, unique, usually the role name. */
  username: string;
  name: string;
  /**
   * Where this role's notifications go. Null until the holder sets it, which
   * they do from the dashboard — it is not a credential and not required.
   */
  email?: string | null;
  passwordHash: string;
  roles: UserRole[];
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
