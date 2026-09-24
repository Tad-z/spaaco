import type { FilterQuery, Model, Types } from 'mongoose';
import { AUTH } from '../config/constants.js';
import { ConflictError, NotFoundError } from '../core/errors.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { Application, Enquiry, Message } from '../models/index.js';
import { privateStorage } from '../integrations/storage/private/index.js';
import { record, recordOrThrow } from './audit.service.js';
import type { ApplicationStatus, SignedFileUrl, SubmissionStatus } from '../types/api.js';
import type {
  PopulatedApplication,
  PopulatedEnquiry,
  PopulatedMessage,
} from '../interfaces/populated-submission.interface.js';

/**
 * Reading and handling submissions.
 *
 * Every single-record read writes an audit entry before the data is returned.
 * These are the only endpoints that disclose a named person's details, and the
 * NDPA question the firm may one day have to answer is "who looked at this?" —
 * which is unanswerable unless it was recorded at the time.
 */

/**
 * Which populated shape each kind returns.
 *
 * A mapped type rather than one loose `Record`: the serializers type-check
 * against the contract only if what reaches them is typed, and a caller that
 * knows its kind then gets the right shape without narrowing.
 */
export interface SubmissionByKind {
  enquiry: PopulatedEnquiry;
  message: PopulatedMessage;
  application: PopulatedApplication;
}

export type Kind = keyof SubmissionByKind;

export interface ActorContext {
  readonly actorId?: Types.ObjectId;
}

export interface ListOptions {
  readonly status?: string;
  readonly job?: string;
  readonly page: number;
  readonly pageSize: number;
}

/** The fields a reference is shown by; enough to label it, and no more. */
const POPULATE = {
  enquiry: [
    { path: 'practiceArea', select: 'slug title shortLabel' },
    { path: 'preferredOffice', select: 'slug name' },
    { path: 'assignedTo', select: 'name' },
  ],
  message: [{ path: 'assignedTo', select: 'name' }],
  application: [{ path: 'job', select: 'title' }],
} as const;

const MODELS: Record<Kind, Model<unknown>> = {
  enquiry: Enquiry as unknown as Model<unknown>,
  message: Message as unknown as Model<unknown>,
  application: Application as unknown as Model<unknown>,
};

const LABELS: Record<Kind, string> = {
  enquiry: 'Enquiry',
  message: 'Message',
  application: 'Application',
};

export async function listSubmissions<K extends Kind>(
  kind: K,
  options: ListOptions,
  context: ActorContext = {}
): Promise<{ items: SubmissionByKind[K][]; total: number }> {
  const filter: Record<string, unknown> = {};
  if (options.status !== undefined) filter.status = options.status;
  if (options.job !== undefined) filter.job = options.job;

  const model = MODELS[kind];

  const [items, total] = await Promise.all([
    model
      .find(filter as FilterQuery<unknown>)
      .populate([...POPULATE[kind]])
      .sort({ createdAt: -1, _id: -1 })
      .skip(toSkip(options.page, options.pageSize))
      .limit(options.pageSize)
      .lean<SubmissionByKind[K][]>(),
    model.countDocuments(filter as FilterQuery<unknown>),
  ]);

  // A list is audited too. Its rows carry the same names, addresses and matter
  // summaries a detail view does, so "who read this?" would otherwise be
  // answerable for one record and not for a hundred of them at once. The entry
  // records the page and filter, never the contents.
  await record({
    action: `${kind}.list`,
    entity: kind,
    actor: context.actorId ?? null,
    meta: {
      page: options.page,
      pageSize: options.pageSize,
      status: options.status ?? 'any',
      returned: items.length,
    },
  });

  return { items, total };
}

/**
 * One submission, and the audit entry that says who read it.
 *
 * The entry is written *before* the document is returned, so a crash between
 * the two leaves a record of an access that may have happened rather than
 * silently losing one that did.
 */
export async function getSubmission<K extends Kind>(
  kind: K,
  id: string,
  context: ActorContext = {}
): Promise<SubmissionByKind[K]> {
  const doc = await MODELS[kind]
    .findById(id)
    .populate([...POPULATE[kind]])
    .lean<SubmissionByKind[K] | null>();

  if (!doc) throw new NotFoundError(LABELS[kind]);

  await record({
    action: `${kind}.view`,
    entity: kind,
    entityId: doc._id,
    actor: context.actorId ?? null,
    // The reference identifies the record without repeating its contents.
    meta: { reference: doc.reference },
  });

  return doc;
}

export interface SubmissionPatch {
  readonly status?: SubmissionStatus | ApplicationStatus;
  readonly assignedTo?: string | null;
}

/**
 * Change how a submission is being handled.
 *
 * Only these fields exist here at all: what somebody typed into a form is a
 * record of what they sent, and the firm editing it after the fact would
 * destroy the one thing that makes it evidence.
 */
export async function updateSubmission<K extends Kind>(
  kind: K,
  id: string,
  patch: SubmissionPatch,
  context: ActorContext = {}
): Promise<SubmissionByKind[K]> {
  const updated = await MODELS[kind]
    .findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true })
    .populate([...POPULATE[kind]])
    .lean<SubmissionByKind[K] | null>();

  if (!updated) throw new NotFoundError(LABELS[kind]);

  // Who *read* an enquiry was answerable and who closed or reassigned it was
  // not — which is the half a partner is more likely to ask about. The field
  // names are recorded, never the values.
  await record({
    action: `${kind}.update`,
    entity: kind,
    entityId: updated._id,
    actor: context.actorId ?? null,
    meta: { changed: Object.keys(patch) },
  });

  return updated;
}

/**
 * A five-minute link to a CV, and the audit entry for it.
 *
 * Refused unless the scan came back clean. `pending` means nobody knows yet
 * and `infected` means the file must never be handed to anybody, so both are
 * a 409 — the request is fine, the state of the record is not.
 */
export async function getCvLink(id: string, context: ActorContext = {}): Promise<SignedFileUrl> {
  const application = await Application.findById(id).select('reference cv').lean<{
    _id: Types.ObjectId;
    reference: string;
    cv: { storageKey: string; originalName: string; scanStatus: string };
  } | null>();

  if (!application) throw new NotFoundError('Application');

  if (application.cv.scanStatus !== 'clean') {
    throw new ConflictError(
      application.cv.scanStatus === 'infected'
        ? 'This CV failed the security scan and cannot be downloaded.'
        : 'This CV has not finished its security scan yet. Try again shortly.',
      [{ path: 'cv.scanStatus', message: application.cv.scanStatus }]
    );
  }

  const signed = await privateStorage().signedUrl(
    application.cv.storageKey,
    AUTH.signedUrlTtlSeconds,
    application.cv.originalName
  );

  // The one audit entry that must not be best effort: without it, a CV has
  // been handed out and nothing says to whom.
  await recordOrThrow({
    action: 'application.cv.view',
    entity: 'application',
    entityId: application._id,
    actor: context.actorId ?? null,
    meta: { reference: application.reference },
  });

  return {
    url: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
    filename: application.cv.originalName,
  };
}
