import { z } from 'zod';
import { PAGINATION } from '../config/constants.js';

/**
 * The newsletter's request bodies (ADR-067).
 *
 * The subscribe body follows the other public forms field for field (consent
 * as a literal, the Turnstile token, the unconstrained honeypot), so the same
 * reasoning in `submission.validator.ts` applies here.
 */

const email = z.string().trim().toLowerCase().email().max(254);

export const newsletterSubscribeBody = z
  .object({
    email,
    consent: z.literal(true),
    consentTextVersion: z.string().trim().min(1).max(40),
    turnstileToken: z.string().trim().min(1).max(2048),
    website: z.string().optional(),
  })
  .strict();

export const newsletterUnsubscribeBody = z.object({ email }).strict();

export const listNewsletterSubscribersQuery = z
  .object({
    q: z.string().trim().min(1).max(254).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(PAGINATION.maxPageSize).default(20),
  })
  .strict();

export type NewsletterSubscribeBody = z.infer<typeof newsletterSubscribeBody>;
export type ListNewsletterSubscribersQuery = z.infer<typeof listNewsletterSubscribersQuery>;
