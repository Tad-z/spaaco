import type { Types } from 'mongoose';
import { config } from '../config/env.js';
import { ValidationError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { hashIp } from '../helpers/hash.helper.js';
import { generateReference } from '../helpers/reference.helper.js';
import type { ReferencePrefix } from '../helpers/reference.helper.js';
import { Enquiry, Message, Office, PracticeArea, Settings } from '../models/index.js';
import { verifyCaptcha } from './captcha.service.js';
import { sendMail } from './notify.service.js';
import {
  acknowledgementEmail,
  notificationEmail,
} from '../templates/emails/submission.template.js';
import type { SubmissionKind } from '../templates/emails/submission.template.js';
import type { EnquiryBody, MessageBody } from '../validators/submission.validator.js';

/**
 * The two JSON forms.
 *
 * Personal data throughout; `.claude/rules/submissions.md` is the specification
 * for most of what happens here. The order is deliberate: honeypot, then
 * captcha, then store, then mail. Each step that can reject does so before
 * anything is written.
 */

export interface RequestContext {
  /** The caller's address, hashed immediately and never stored raw. */
  readonly ip: string;
  readonly userAgent?: string | undefined;
}

export interface SubmissionResult {
  readonly reference: string;
}

/** A bot filled the hidden field. */
const isBot = (website: string | undefined): boolean =>
  website !== undefined && website.trim() !== '';

/**
 * The firm's own name, for the sign-off on an acknowledgement.
 *
 * Read from settings rather than hardcoded, because the firm can change it and
 * an email signed with a stale name is exactly the sort of small wrongness
 * nobody notices until a client does.
 */
async function firmName(): Promise<string> {
  const settings = await Settings.findOne({ key: 'site' })
    .select('firmName')
    .lean<{ firmName: string } | null>();

  return settings?.firmName ?? 'S. P. A. Ajibade & Co.';
}

const firstNameOf = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName;

/**
 * Verify the token, or fail with the field named.
 *
 * A captcha failure is a 400 on `turnstileToken` rather than a 403: from the
 * frontend's point of view the token it sent was not acceptable, and the form
 * should re-challenge and resubmit.
 */
async function requireHuman(token: string, ip: string): Promise<void> {
  if (await verifyCaptcha(token, ip)) return;

  throw new ValidationError('The bot check did not pass. Please try again.', [
    { path: 'turnstileToken', message: 'verification failed' },
  ]);
}

/**
 * Tell the firm, then the submitter.
 *
 * Awaited so a test can observe it, but every failure inside `sendMail` is
 * already swallowed — the submission is stored by this point and must not be
 * undone by a mail provider having a bad afternoon.
 */
async function notify(
  kind: SubmissionKind,
  reference: string,
  submitter: { email: string; fullName: string },
  notifyTo: string
): Promise<void> {
  await sendMail({ to: notifyTo, ...notificationEmail(kind, reference) });

  await sendMail({
    to: submitter.email,
    ...acknowledgementEmail(kind, reference, firstNameOf(submitter.fullName), await firmName()),
  });
}

/** What every stored submission carries about its sender and their consent. */
function envelope(
  prefix: ReferencePrefix,
  body: { consentTextVersion: string },
  context: RequestContext
): Record<string, unknown> {
  return {
    reference: generateReference(prefix),
    consent: { given: true, textVersion: body.consentTextVersion, at: new Date() },
    ipHash: hashIp(context.ip, config.IP_HASH_SALT),
    userAgent: context.userAgent ?? null,
  };
}

export async function submitEnquiry(
  body: EnquiryBody,
  context: RequestContext
): Promise<SubmissionResult> {
  if (isBot(body.website)) return silentlyAccept('ENQ');

  await requireHuman(body.turnstileToken, context.ip);

  // Resolved to ids so the dashboard can link them; an unknown slug is simply
  // dropped rather than refused, since the visitor's enquiry still stands.
  const [area, office] = await Promise.all([
    body.practiceArea === undefined
      ? null
      : PracticeArea.findOne({ slug: body.practiceArea }).select('_id').lean<{
          _id: Types.ObjectId;
        } | null>(),
    body.preferredOffice === undefined
      ? null
      : Office.findById(body.preferredOffice).select('_id').lean<{ _id: Types.ObjectId } | null>(),
  ]);

  const created = await Enquiry.create({
    ...envelope('ENQ', body, context),
    fullName: body.fullName,
    organization: body.organization ?? null,
    email: body.email,
    phone: body.phone ?? null,
    practiceArea: area?._id ?? null,
    preferredOffice: office?._id ?? null,
    summary: body.summary,
  });

  logger.info({ reference: created.reference, form: 'enquiry' }, 'submission received');

  await notify('enquiry', created.reference, body, config.NOTIFY_ENQUIRIES_TO);

  return { reference: created.reference };
}

export async function submitMessage(
  body: MessageBody,
  context: RequestContext
): Promise<SubmissionResult> {
  if (isBot(body.website)) return silentlyAccept('MSG');

  await requireHuman(body.turnstileToken, context.ip);

  const created = await Message.create({
    ...envelope('MSG', body, context),
    fullName: body.fullName,
    email: body.email,
    phone: body.phone ?? null,
    subject: body.subject ?? null,
    message: body.message,
  });

  logger.info({ reference: created.reference, form: 'message' }, 'submission received');

  await notify('message', created.reference, body, config.NOTIFY_ENQUIRIES_TO);

  return { reference: created.reference };
}

/**
 * What a bot gets: a well-formed reference, and nothing else happening.
 *
 * Returning 201 with a real-looking reference is the point. A bot told it was
 * caught retries without the honeypot field; a bot told it succeeded moves on.
 * Nothing is stored and no mail is sent, so the cost is a random string.
 */
function silentlyAccept(prefix: ReferencePrefix): SubmissionResult {
  const reference = generateReference(prefix);
  logger.info({ reference, outcome: 'honeypot' }, 'submission discarded');

  return { reference };
}
