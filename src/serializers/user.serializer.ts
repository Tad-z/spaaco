import type { AdminUser, AuditLogEntry } from '../types/api.js';
import type { IUser } from '../interfaces/user.interface.js';
import type { IAuditLog } from '../interfaces/audit-log.interface.js';

/**
 * Admin account payloads.
 *
 * `passwordHash` is absent from the output type, so it cannot be returned even
 * by accident.
 */
export const toAdminUser = (user: IUser): AdminUser => ({
  id: user._id.toString(),
  username: user.username,
  name: user.name,
  email: user.email ?? null,
  roles: user.roles,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
});

export type AuditLogSource = Omit<IAuditLog, 'actor'> & {
  actor: Pick<IUser, '_id' | 'username' | 'name'> | null;
};

export const toAuditLogEntry = (entry: AuditLogSource): AuditLogEntry => ({
  id: entry._id.toString(),
  actor: entry.actor
    ? {
        id: entry.actor._id.toString(),
        username: entry.actor.username,
        name: entry.actor.name,
      }
    : null,
  action: entry.action,
  entity: entry.entity,
  entityId: entry.entityId?.toString() ?? null,
  meta: entry.meta,
  at: entry.at.toISOString(),
});
