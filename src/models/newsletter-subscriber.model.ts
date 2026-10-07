import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { INewsletterSubscriber } from '../interfaces/newsletter-subscriber.interface.js';
import { NEWSLETTER_STATUSES } from '../constants/enums.js';
import { consentSchema } from './schemas/consent.schema.js';

/**
 * The newsletter mailing list (ADR-065).
 *
 * One record per address. Retention is per record rather than per collection:
 * `expiresAt` is set while an address is pending or unsubscribed and cleared
 * while it is subscribed, and a TTL index on it deletes whatever has lapsed. A
 * subscriber with no `expiresAt` is kept until they leave.
 */
const newsletterSubscriberSchema = new Schema<INewsletterSubscriber>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    status: {
      type: String,
      required: true,
      enum: NEWSLETTER_STATUSES.values,
      default: 'pending',
      index: true,
    },
    consent: { type: consentSchema, required: true },
    confirmTokenHash: { type: String, default: null, maxlength: 64 },
    unsubscribeToken: { type: String, required: true, unique: true, maxlength: 64 },
    subscribedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    ipHash: { type: String, required: true, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 400 },
  },
  { timestamps: true, strict: 'throw' }
);

newsletterSubscriberSchema.index({ createdAt: -1 });
newsletterSubscriberSchema.index(
  { confirmTokenHash: 1 },
  { partialFilterExpression: { confirmTokenHash: { $type: 'string' } } }
);
// A null `expiresAt` is never matched by a TTL index, so subscribers stay.
newsletterSubscriberSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NewsletterSubscriber: Model<INewsletterSubscriber> = model<INewsletterSubscriber>(
  'NewsletterSubscriber',
  newsletterSubscriberSchema
);
