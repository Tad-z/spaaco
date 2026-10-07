import { z } from 'zod';
import { NEWSLETTER_STATUSES } from '../constants/enums.js';
import { PAGINATION } from '../config/constants.js';

/**
 * The newsletter's request bodies (ADR-065).
 *
 * The subscribe body follows the other public forms field for field (consent
 * as a literal, the Turnstile token, the unconstrained honeypot), so the same
 * reasoning in `submission.validator.ts` applies here.
 */

export const newsletterSubscribeBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    consent: z.literal(true),
    consentTextVersion: z.string().trim().min(1).max(40),
    turnstileToken: z.string().trim().min(1).max(2048),
    website: z.string().optional(),
  })
  .strict();

/** A `randomToken()`: 32 bytes, base64url, so exactly 43 characters. */
export const newsletterTokenBody = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'token is not a valid link token') })
  .strict();

export const listNewsletterSubscribersQuery = z
  .object({
    status: z.enum(NEWSLETTER_STATUSES.values).optional(),
    q: z.string().trim().min(1).max(254).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGINATION.maxPageSize).default(20),
  })
  .strict();

export type NewsletterSubscribeBody = z.infer<typeof newsletterSubscribeBody>;
export type NewsletterTokenBody = z.infer<typeof newsletterTokenBody>;
export type ListNewsletterSubscribersQuery = z.infer<typeof listNewsletterSubscribersQuery>;
