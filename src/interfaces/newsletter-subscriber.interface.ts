import type { IConsent } from './enquiry.interface.js';

/**
 * One address on the newsletter list (ADR-067). Personal data.
 *
 * A record exists only while the address is subscribed: unsubscribing deletes
 * it, so there is no status to keep.
 */
export interface INewsletterSubscriber {
  email: string;
  /** The consent given on the most recent subscribe. */
  consent: IConsent;
  ipHash: string;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
