import type {
  ApplicationAdmin,
  EnquiryAdmin,
  MessageAdmin,
  SubmissionConsent,
} from '../types/api.js';

/**
 * Submissions as the dashboard shows them.
 *
 * These serializers are as much about omission as about shape. `ipHash` and
 * `userAgent` are stored for abuse investigation and never returned — they
 * help nobody reading an enquiry, and every copy of personal data is a copy
 * that can leak. The CV's `storageKey` is absent for a stronger reason: it is
 * the only handle on the file, and a signed link is the only way in.
 */

export type StoredSubmission = Record<string, unknown>;

const ISO = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(0).toISOString();

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const orNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const consentOf = (value: unknown): SubmissionConsent => {
  const consent = (value ?? {}) as { textVersion?: unknown; at?: unknown };

  return { given: true, textVersion: str(consent.textVersion), at: ISO(consent.at) };
};

/** A populated reference, or null when it was never set or has been deleted. */
function refOf<T>(value: unknown, shape: (doc: Record<string, unknown>) => T): T | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('_id' in value)) return null;

  return shape(value);
}

const practiceAreaRef = (doc: Record<string, unknown>): Record<string, unknown> => ({
  id: String(doc._id),
  slug: str(doc.slug),
  title: str(doc.title),
  shortLabel: str(doc.shortLabel),
});

const officeRef = (doc: Record<string, unknown>): Record<string, unknown> => ({
  id: String(doc._id),
  slug: str(doc.slug),
  name: str(doc.name),
});

const jobRef = (doc: Record<string, unknown>): Record<string, unknown> => ({
  id: String(doc._id),
  title: str(doc.title),
});

const actorRef = (doc: Record<string, unknown>): Record<string, unknown> => ({
  id: String(doc._id),
  name: str(doc.name),
});

export function toEnquiryAdmin(doc: StoredSubmission): EnquiryAdmin {
  return {
    id: String(doc._id),
    reference: str(doc.reference),
    fullName: str(doc.fullName),
    email: str(doc.email),
    phone: orNull(doc.phone),
    organization: orNull(doc.organization),
    practiceArea: refOf(doc.practiceArea, practiceAreaRef),
    preferredOffice: refOf(doc.preferredOffice, officeRef),
    summary: str(doc.summary),
    consent: consentOf(doc.consent),
    status: doc.status,
    assignedTo: refOf(doc.assignedTo, actorRef),
    createdAt: ISO(doc.createdAt),
  } as unknown as EnquiryAdmin;
}

export function toMessageAdmin(doc: StoredSubmission): MessageAdmin {
  return {
    id: String(doc._id),
    reference: str(doc.reference),
    fullName: str(doc.fullName),
    email: str(doc.email),
    phone: orNull(doc.phone),
    subject: orNull(doc.subject),
    message: str(doc.message),
    consent: consentOf(doc.consent),
    status: doc.status,
    assignedTo: refOf(doc.assignedTo, actorRef),
    createdAt: ISO(doc.createdAt),
  } as unknown as MessageAdmin;
}

export function toApplicationAdmin(doc: StoredSubmission): ApplicationAdmin {
  const cv = (doc.cv ?? {}) as Record<string, unknown>;

  return {
    id: String(doc._id),
    reference: str(doc.reference),
    job: refOf(doc.job, jobRef),
    fullName: str(doc.fullName),
    email: str(doc.email),
    phone: orNull(doc.phone),
    coverNote: orNull(doc.coverNote),
    cv: {
      // No storageKey: see the note at the top of this file.
      originalName: str(cv.originalName),
      mimeType: str(cv.mimeType),
      bytes: typeof cv.bytes === 'number' ? cv.bytes : 0,
      scanStatus: cv.scanStatus,
    },
    consent: consentOf(doc.consent),
    status: doc.status,
    createdAt: ISO(doc.createdAt),
  } as unknown as ApplicationAdmin;
}
