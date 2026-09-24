import type { Types } from 'mongoose';
import { AuditLog } from '../models/index.js';
import { logger } from '../core/logger.js';
import { toSkip } from '../helpers/pagination.helper.js';
import type { IAuditLog } from '../interfaces/audit-log.interface.js';
import type { IUser } from '../interfaces/user.interface.js';

/**
 * The audit trail.
 *
 * Recording must never break the action being recorded: a failed write is
 * logged and swallowed, because refusing to publish an insight because the
 * audit collection hiccuped would be worse than a missing line.
 *
 * `meta` must never carry personal data. Submission entries record the
 * reference, not the submitter.
 */

export interface AuditEntry {
  readonly actor?: Types.ObjectId | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId?: Types.ObjectId | null;
  readonly meta?: Record<string, unknown>;
  readonly ipHash?: string | null;
}

export async function record(entry: AuditEntry): Promise<void> {
  try {
    await write(entry);
  } catch (error: unknown) {
    logger.error({ err: error, action: entry.action }, 'failed to write an audit entry');
  }
}

/**
 * Record it, or fail the action being recorded.
 *
 * For almost everything, swallowing a failed audit write is right: refusing to
 * publish an insight because the audit collection hiccuped would be worse than
 * a missing line. Handing over a CV is the exception — the trail is the only
 * thing that makes the disclosure accountable, so if it cannot be written the
 * disclosure must not happen.
 */
export async function recordOrThrow(entry: AuditEntry): Promise<void> {
  await write(entry);
}

async function write(entry: AuditEntry): Promise<void> {
  await AuditLog.create({
    actor: entry.actor ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    meta: entry.meta ?? {},
    ipHash: entry.ipHash ?? null,
    at: new Date(),
  });
}

export type AuditLogWithActor = Omit<IAuditLog, 'actor'> & {
  actor: Pick<IUser, '_id' | 'username' | 'name'> | null;
};

export interface ListAuditOptions {
  readonly action?: string;
  readonly actor?: string;
  readonly page: number;
  readonly pageSize: number;
}

export async function listAuditLogs(
  options: ListAuditOptions
): Promise<{ items: AuditLogWithActor[]; total: number }> {
  const filter: Record<string, unknown> = {};
  if (options.action !== undefined) filter.action = options.action;
  if (options.actor !== undefined) filter.actor = options.actor;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('actor', 'username name')
      .sort({ at: -1 })
      .skip(toSkip(options.page, options.pageSize))
      .limit(options.pageSize)
      .lean<AuditLogWithActor[]>(),
    AuditLog.countDocuments(filter),
  ]);

  return { items, total };
}
