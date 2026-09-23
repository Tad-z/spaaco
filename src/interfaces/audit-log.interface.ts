import type { Types } from 'mongoose';

/**
 * A privileged action worth being able to reconstruct later: publishing,
 * deletes, media replacement, and every view of a submission or CV.
 *
 * `meta` must never carry personal data. A submission entry records the
 * reference, not the submitter.
 */
export interface IAuditLog {
  _id: Types.ObjectId;
  actor?: Types.ObjectId | null;
  action: string;
  entity: string;
  entityId?: Types.ObjectId | null;
  meta: Record<string, unknown>;
  /** Salted hash, never the raw address. */
  ipHash?: string | null;
  at: Date;
}
