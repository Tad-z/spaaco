import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { INewsletterSubscriber } from '../interfaces/newsletter-subscriber.interface.js';
import { consentSchema } from './schemas/consent.schema.js';

/**
 * The newsletter mailing list (ADR-067).
 *
 * One record per subscribed address, kept until its owner unsubscribes or the
 * firm erases it. There is no TTL: unlike a form submission, the purpose lasts
 * as long as the subscription does.
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
    consent: { type: consentSchema, required: true },
    ipHash: { type: String, required: true, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 400 },
  },
  { timestamps: true, strict: 'throw' }
);

newsletterSubscriberSchema.index({ createdAt: -1 });

export const NewsletterSubscriber: Model<INewsletterSubscriber> = model<INewsletterSubscriber>(
  'NewsletterSubscriber',
  newsletterSubscriberSchema
);
