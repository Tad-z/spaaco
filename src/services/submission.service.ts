import type { Types } from 'mongoose';
import { config } from '../config/env.js';
import {
  FileRejectedError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../core/errors.js';
import { logger } from '../core/logger.js';
import { hashIp } from '../helpers/hash.helper.js';
import { generateReference } from '../helpers/reference.helper.js';
import type { ReferencePrefix } from '../helpers/reference.helper.js';
import {
  Application,
  Enquiry,
  Job,
  Message,
  Office,
  PracticeArea,
  Settings,
  User,
} from '../models/index.js';
import { privateStorage } from '../integrations/storage/private/index.js';
import { scanFile } from './virus-scan.service.js';
import { DOCX_MIME, PDF_MIME, sniffDocumentType } from '../helpers/document-type.helper.js';
import { verifyCaptcha } from './captcha.service.js';
import { sendMail } from './notify.service.js';
import {
  acknowledgementEmail,
  notificationEmail,
} from '../templates/emails/submission.template.js';
import type { SubmissionKind } from '../templates/emails/submission.template.js';
import type { UserRole } from '../types/api.js';
import type {
  ApplicationBody,
  EnquiryBody,
  MessageBody,
} from '../validators/submission.validator.js';

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

/** The column width in every submission model. */
export const USER_AGENT_MAX = 400;

/** A bot filled the hidden field. */
export const isBot = (website: string | undefined): boolean =>
  website !== undefined && website.trim() !== '';

/**
 * The firm's own name, for the sign-off on an acknowledgement.
 *
 * Read from settings rather than hardcoded, because the firm can change it and
 * an email signed with a stale name is exactly the sort of small wrongness
 * nobody notices until a client does.
 */
export async function firmName(): Promise<string> {
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
export async function requireHuman(token: string, ip: string): Promise<void> {
  if (await verifyCaptcha(token, ip)) return;

  throw new ValidationError('The bot check did not pass. Please try again.', [
    { path: 'turnstileToken', message: 'verification failed' },
  ]);
}

/**
 * Where a form's notification goes: the inbox of the role that handles it.
 *
 * Enquiries and messages are business development's work, applications are
 * HR's — the same split the role matrix enforces on reading them. The address
 * comes from that account's profile rather than an environment variable, so
 * whoever holds the role can redirect their own notifications without a deploy
 * (ADR-043).
 *
 * `undefined` when nobody has set one yet. The caller logs it and carries on:
 * the submission is already stored, and losing an enquiry because nobody
 * filled in a profile field would be a far worse failure than a missed email.
 */
async function recipientFor(role: UserRole): Promise<string | undefined> {
  const account = await User.findOne({ roles: role, isActive: true })
    .select('email')
    .lean<{ email?: string | null } | null>();

  return account?.email ?? undefined;
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
  notifyRole: UserRole
): Promise<void> {
  const notifyTo = await recipientFor(notifyRole);

  if (notifyTo === undefined) {
    // The reference only: the point of this branch is that somebody notices
    // the gap, not that the log becomes a copy of the submission.
    logger.warn(
      { reference, role: notifyRole },
      'no notification address is set for this role; nobody was told'
    );
  } else {
    await sendMail({ to: notifyTo, ...notificationEmail(kind, reference) });
  }

  await sendMail({
    to: submitter.email,
    ...acknowledgementEmail(kind, reference, firstNameOf(submitter.fullName), await firmName()),
  });
}

/**
 * Create the record, retrying once if the reference collided.
 *
 * ~1.5 billion references makes a collision rare, not impossible, and the
 * unique index turns one into a 500 on a perfectly good submission. One retry
 * makes the odds of a visible failure vanishingly small.
 */
async function createWithReference<T>(
  prefix: ReferencePrefix,
  create: (reference: string) => Promise<T>
): Promise<T> {
  try {
    return await create(generateReference(prefix));
  } catch (error: unknown) {
    if (!isDuplicateKey(error)) throw error;

    logger.warn({ prefix }, 'reference collided; retrying with a new one');
    return create(generateReference(prefix));
  }
}

const isDuplicateKey = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && (error as { code: unknown }).code === 11000;

/** What every stored submission carries about its sender and their consent. */
function envelope(
  reference: string,
  body: { consentTextVersion: string },
  context: RequestContext
): Record<string, unknown> {
  return {
    reference,
    consent: { given: true, textVersion: body.consentTextVersion, at: new Date() },
    ipHash: hashIp(context.ip, config.IP_HASH_SALT),
    // Truncated to the column width rather than passed through. A longer
    // header made Mongoose reject the whole document, which lost the
    // submission — and for an application, after the CV had already been
    // stored — and put the raw header into the log and the error report
    // through Mongoose's message template.
    userAgent: context.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
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

  const created = await createWithReference('ENQ', (reference) =>
    Enquiry.create({
      ...envelope(reference, body, context),
      fullName: body.fullName,
      organization: body.organization ?? null,
      email: body.email,
      phone: body.phone ?? null,
      practiceArea: area?._id ?? null,
      preferredOffice: office?._id ?? null,
      summary: body.summary,
    })
  );

  logger.info({ reference: created.reference, form: 'enquiry' }, 'submission received');

  await notify('enquiry', created.reference, body, 'business_dev');

  return { reference: created.reference };
}

export async function submitMessage(
  body: MessageBody,
  context: RequestContext
): Promise<SubmissionResult> {
  if (isBot(body.website)) return silentlyAccept('MSG');

  await requireHuman(body.turnstileToken, context.ip);

  const created = await createWithReference('MSG', (reference) =>
    Message.create({
      ...envelope(reference, body, context),
      fullName: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      subject: body.subject ?? null,
      message: body.message,
    })
  );

  logger.info({ reference: created.reference, form: 'message' }, 'submission received');

  await notify('message', created.reference, body, 'business_dev');

  return { reference: created.reference };
}

const CV_EXTENSIONS: Record<string, string> = { [PDF_MIME]: 'pdf', [DOCX_MIME]: 'docx' };

export interface ApplicationUpload {
  readonly buffer: Buffer;
  readonly originalName: string;
}

/**
 * Apply for a vacancy.
 *
 * The order is the security property: honeypot, captcha, vacancy, type, scan,
 * *then* store. A file that fails any check never reaches the firm's storage,
 * and nothing about the applicant is written until the file is known to be a
 * genuine, clean CV.
 */
export async function submitApplication(
  jobId: string,
  body: ApplicationBody,
  cv: ApplicationUpload,
  context: RequestContext
): Promise<SubmissionResult> {
  if (isBot(body.website)) return silentlyAccept('APP');

  await requireHuman(body.turnstileToken, context.ip);

  // Only a vacancy the public can see and that is still taking applicants. A
  // draft or closed job answers 404 rather than 403: whether it exists is not
  // something an anonymous caller needs told.
  const job = await Job.findOne({ _id: jobId, status: 'published', isOpen: true })
    .select('_id title')
    .lean<{ _id: Types.ObjectId; title: string } | null>();

  if (!job) throw new NotFoundError('Vacancy');

  const mimeType = sniffDocumentType(cv.buffer);
  if (mimeType === undefined) {
    throw new UnsupportedMediaTypeError('Upload your CV as a PDF or a Word (.docx) document.');
  }

  if ((await scanFile(cv.buffer)) === 'infected') {
    // 422, not 400: the fields were fine, the file was not (ADR-026).
    throw new FileRejectedError(
      'That file did not pass our security scan. Please check it and try again.'
    );
  }

  const storageKey = await privateStorage().put({
    buffer: cv.buffer,
    mimeType,
    extension: CV_EXTENSIONS[mimeType] ?? 'bin',
  });

  const created = await createWithReference('APP', (reference) =>
    Application.create({
      ...envelope(reference, body, context),
      job: job._id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      coverNote: body.coverNote ?? null,
      cv: {
        storageKey,
        originalName: cv.originalName,
        mimeType,
        bytes: cv.buffer.byteLength,
        scanStatus: 'clean',
      },
    })
  );

  logger.info({ reference: created.reference, form: 'application' }, 'submission received');

  await notify('application', created.reference, body, 'hr');

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
