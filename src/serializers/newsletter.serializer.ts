import type { Types } from 'mongoose';
import type { NewsletterSubscriberAdmin } from '../types/api.js';
import type { INewsletterSubscriber } from '../interfaces/newsletter-subscriber.interface.js';
import { toCsv } from '../helpers/csv.helper.js';

/**
 * The mailing list as the dashboard shows it (ADR-067).
 *
 * `ipHash` and the user agent stay behind for abuse investigation, as with
 * every submission. A record exists only while subscribed, so its creation
 * time is when the address subscribed.
 */

type SubscriberDoc = Pick<INewsletterSubscriber, 'email' | 'consent' | 'createdAt'> & {
  _id: Types.ObjectId;
};

export function toNewsletterSubscriberAdmin(doc: SubscriberDoc): NewsletterSubscriberAdmin {
  return {
    id: doc._id.toString(),
    email: doc.email,
    consent: {
      given: true,
      textVersion: doc.consent.textVersion,
      at: doc.consent.at.toISOString(),
    },
    subscribedAt: doc.createdAt.toISOString(),
  };
}

export function toNewsletterCsv(
  rows: readonly Pick<INewsletterSubscriber, 'email' | 'createdAt'>[]
): string {
  return toCsv(
    ['email', 'subscribedAt'],
    rows.map((row) => [row.email, row.createdAt.toISOString()])
  );
}
