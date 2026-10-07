import type { NewsletterSubscriptionStatus } from '../types/api.js';
import type { IConsent } from './enquiry.interface.js';

/** One address on the newsletter list (ADR-065). Personal data. */
export interface INewsletterSubscriber {
  email: string;
  status: NewsletterSubscriptionStatus;
  /** The consent given on the most recent subscribe. */
  consent: IConsent;
  /** sha256 of the emailed confirmation token. Null once used. */
  confirmTokenHash?: string | null;
  /**
   * Stored as issued, unlike the confirmation token: every newsletter must
   * carry it, including ones the firm sends from another tool off the export.
   * It can do one thing — take its own address off this list.
   */
  unsubscribeToken: string;
  subscribedAt?: Date | null;
  unsubscribedAt?: Date | null;
  /** When the TTL index deletes the record. Null while subscribed. */
  expiresAt?: Date | null;
  ipHash: string;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
