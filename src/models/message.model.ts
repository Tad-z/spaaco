import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IMessage } from '../interfaces/message.interface.js';
import { SUBMISSION_STATUSES } from '../constants/enums.js';
import { config } from '../config/env.js';
import { consentSchema } from './schemas/consent.schema.js';

/** Messages to the firm. Same retention rule as enquiries. */
const messageSchema = new Schema<IMessage>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, maxlength: 20 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: null, trim: true, maxlength: 20 },
    subject: { type: String, default: null, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
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

messageSchema.index({ createdAt: -1 });
messageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: config.RETENTION_ENQUIRY_DAYS * 24 * 60 * 60 }
);

export const Message: Model<IMessage> = model<IMessage>('Message', messageSchema);
