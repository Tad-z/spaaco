import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IApplication, IApplicationCv } from '../interfaces/application.interface.js';
import { APPLICATION_STATUSES, SCAN_STATUSES } from '../constants/enums.js';
import { UPLOAD_LIMITS } from '../config/constants.js';
import { config } from '../config/env.js';
import { consentSchema } from './schemas/consent.schema.js';

const cvSchema = new Schema<IApplicationCv>(
  {
    storageKey: { type: String, required: true, maxlength: 300 },
    originalName: { type: String, required: true, maxlength: 260 },
    mimeType: { type: String, required: true, enum: UPLOAD_LIMITS.cvMimeTypes },
    bytes: { type: Number, required: true, min: 1, max: UPLOAD_LIMITS.cvMaxBytes },
    scanStatus: { type: String, required: true, enum: SCAN_STATUSES.values, default: 'pending' },
  },
  { _id: false, versionKey: false }
);

/**
 * Job applications. Personal data, with a file attached.
 *
 * `job` is nullable and not required: a vacancy may be deleted while
 * applications to it are still within their retention period, and losing the
 * application would be worse than showing it without its vacancy.
 */
const applicationSchema = new Schema<IApplication>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, maxlength: 20 },
    job: { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: null, trim: true, maxlength: 20 },
    coverNote: { type: String, default: null, trim: true, maxlength: 2000 },
    cv: { type: cvSchema, required: true },
    consent: { type: consentSchema, required: true },
    status: {
      type: String,
      required: true,
      enum: APPLICATION_STATUSES.values,
      default: 'new',
      index: true,
    },
    ipHash: { type: String, required: true, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 400 },
  },
  { timestamps: true, strict: 'throw' }
);

applicationSchema.index({ createdAt: -1 });
applicationSchema.index({ job: 1, createdAt: -1 });
// TTL expiry drops the record; the orphan sweep then removes its file (6.5).
applicationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: config.RETENTION_APPLICATION_DAYS * 24 * 60 * 60 }
);

export const Application: Model<IApplication> = model<IApplication>(
  'Application',
  applicationSchema
);
