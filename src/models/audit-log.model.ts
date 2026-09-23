import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IAuditLog } from '../interfaces/audit-log.interface.js';

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, maxlength: 80 },
    entity: { type: String, required: true, maxlength: 80 },
    entityId: { type: Schema.Types.ObjectId, default: null },
    // Never personal data: a submission entry records the reference only.
    meta: { type: Schema.Types.Mixed, default: {} },
    ipHash: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false, strict: 'throw' }
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ actor: 1, at: -1 });

export const AuditLog: Model<IAuditLog> = model<IAuditLog>('AuditLog', auditLogSchema);
