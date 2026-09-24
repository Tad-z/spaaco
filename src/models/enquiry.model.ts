import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IEnquiry } from '../interfaces/enquiry.interface.js';
import { SUBMISSION_STATUSES } from '../constants/enums.js';
import { config } from '../config/env.js';
import { consentSchema } from './schemas/consent.schema.js';

/**
 * Mandate enquiries. Personal data: see `.claude/rules/submissions.md`.
 *
 * Retention is a TTL index rather than a job, so expiry happens even if the
 * application is never deployed again — MongoDB enforces it, not our code.
 */
const enquirySchema = new Schema<IEnquiry>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, maxlength: 20 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    organization: { type: String, default: null, trim: true, maxlength: 160 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: null, trim: true, maxlength: 20 },
    practiceArea: { type: Schema.Types.ObjectId, ref: 'PracticeArea', default: null },
    preferredOffice: { type: Schema.Types.ObjectId, ref: 'Office', default: null },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    consent: { type: consentSchema, required: true },
    status: {
      type: String,
      required: true,
      enum: SUBMISSION_STATUSES.values,
      default: 'new',
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ipHash: { type: String, required: true, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 400 },
  },
  { timestamps: true, strict: 'throw' }
);

enquirySchema.index({ createdAt: -1 });
enquirySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: config.RETENTION_ENQUIRY_DAYS * 24 * 60 * 60 }
);

export const Enquiry: Model<IEnquiry> = model<IEnquiry>('Enquiry', enquirySchema);
