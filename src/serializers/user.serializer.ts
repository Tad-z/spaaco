import type { AdminUser, AuditLogEntry } from '../types/api.js';
import type { IUser } from '../interfaces/user.interface.js';
import type { IAuditLog } from '../interfaces/audit-log.interface.js';

/**
 * Admin account payloads.
 *
 * `passwordHash` and the TOTP secret are absent from the output type, so they
 * cannot be returned even by accident; only whether two-factor is on is shown.
 */
export const toAdminUser = (user: IUser): AdminUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  roles: user.roles,
  totpEnabled: user.totp.enabled,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
});

export type AuditLogSource = Omit<IAuditLog, 'actor'> & {
  actor: Pick<IUser, '_id' | 'name' | 'email'> | null;
};

export const toAuditLogEntry = (entry: AuditLogSource): AuditLogEntry => ({
  id: entry._id.toString(),
  actor: entry.actor
    ? { id: entry.actor._id.toString(), name: entry.actor.name, email: entry.actor.email }
    : null,
  action: entry.action,
  entity: entry.entity,
  entityId: entry.entityId?.toString() ?? null,
  meta: entry.meta,
  at: entry.at.toISOString(),
});
