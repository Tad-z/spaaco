import type { NewsletterSubscriberAdmin } from '../types/api.js';
import type { INewsletterSubscriber } from '../interfaces/newsletter-subscriber.interface.js';
import type { Types } from 'mongoose';
import { toCsv } from '../helpers/csv.helper.js';

/**
 * The mailing list as the dashboard shows it (ADR-065).
 *
 * Neither token appears: the confirmation hash is useless to a reader, and the
 * unsubscribe token travels only inside the export's links, where it is the
 * point. `ipHash` and the user agent stay behind for abuse investigation, as
 * with every submission.
 */

type SubscriberDoc = Pick<
  INewsletterSubscriber,
  'email' | 'status' | 'consent' | 'subscribedAt' | 'unsubscribedAt' | 'createdAt'
> & { _id: Types.ObjectId };

const isoOrNull = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

export function toNewsletterSubscriberAdmin(doc: SubscriberDoc): NewsletterSubscriberAdmin {
  return {
    id: doc._id.toString(),
    email: doc.email,
    status: doc.status,
    consent: {
      given: true,
      textVersion: doc.consent.textVersion,
      at: doc.consent.at.toISOString(),
    },
    subscribedAt: isoOrNull(doc.subscribedAt),
    unsubscribedAt: isoOrNull(doc.unsubscribedAt),
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface NewsletterExportRow {
  readonly email: string;
  readonly subscribedAt: Date;
  readonly unsubscribeUrl: string;
}

export function toNewsletterCsv(rows: readonly NewsletterExportRow[]): string {
  return toCsv(
    ['email', 'subscribedAt', 'unsubscribeUrl'],
    rows.map((row) => [row.email, row.subscribedAt.toISOString(), row.unsubscribeUrl])
  );
}
