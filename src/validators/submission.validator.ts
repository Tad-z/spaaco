import { z } from 'zod';
import { objectId, slug } from './common.validator.js';

/**
 * The public form bodies.
 *
 * Every field is untrusted input from an unauthenticated visitor, so the rules
 * are tight and `.strict()` refuses anything not listed — an unexpected field
 * is either a client bug or somebody probing, and neither should be stored.
 *
 * Nothing here is sanitised as HTML, because none of it is ever rendered as
 * HTML: submissions are shown in the dashboard as text.
 */

const fullName = z.string().trim().min(2).max(120);
const email = z.string().trim().toLowerCase().email().max(254);

/** E.164 or a Nigerian local format; both are common in the designs. */
const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+0-9 ()-]{7,20}$/, 'phone must be a valid telephone number')
  .optional();

/**
 * Consent is a literal `true`, not a boolean.
 *
 * `false` is not a value this API stores: a record exists because somebody
 * consented. Refusing it here means the model never has to represent
 * "submitted without consent" at all.
 */
const consent = z.literal(true);
const consentTextVersion = z.string().trim().min(1).max(40);
const turnstileToken = z.string().trim().min(1).max(2048);

/**
 * The honeypot.
 *
 * A real browser leaves it empty because it is hidden; a bot fills every field
 * it finds. Accepted as any string so the request still validates, then
 * checked by the service, which answers 201 and stores nothing.
 */
const website = z.string().max(200).optional();

export const enquiryBody = z
  .object({
    fullName,
    email,
    phone,
    organization: z.string().trim().max(160).optional(),
    practiceArea: slug.optional(),
    preferredOffice: objectId.optional(),
    summary: z.string().trim().min(20).max(2000),
    consent,
    consentTextVersion,
    turnstileToken,
    website,
  })
  .strict();

export const messageBody = z
  .object({
    fullName,
    email,
    phone,
    subject: z.string().trim().max(160).optional(),
    message: z.string().trim().min(10).max(2000),
    consent,
    consentTextVersion,
    turnstileToken,
    website,
  })
  .strict();

export type EnquiryBody = z.infer<typeof enquiryBody>;
export type MessageBody = z.infer<typeof messageBody>;
