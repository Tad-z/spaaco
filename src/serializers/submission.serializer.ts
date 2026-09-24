import type {
  ApplicationAdmin,
  EnquiryAdmin,
  MessageAdmin,
  SubmissionConsent,
} from '../types/api.js';
import type { IConsent } from '../interfaces/enquiry.interface.js';
import type {
  JobRefDoc,
  OfficeRefDoc,
  PopulatedApplication,
  PopulatedEnquiry,
  PopulatedMessage,
  PracticeAreaRefDoc,
  UserRefDoc,
} from '../interfaces/populated-submission.interface.js';

/**
 * Submissions as the dashboard shows them.
 *
 * These serializers are as much about omission as about shape. `ipHash` and
 * `userAgent` are stored for abuse investigation and never returned — they
 * help nobody reading an enquiry, and every copy of personal data is a copy
 * that can leak. The CV's `storageKey` is absent for a stronger reason: it is
 * the only handle on the file, and a signed link is the only way in.
 *
 * The return types come from the contract and the arguments from the models,
 * so a field added to either side fails to compile rather than quietly
 * disappearing from a payload.
 */

const ISO = (value: Date): string => value.toISOString();

const consentOf = (consent: IConsent): SubmissionConsent => ({
  given: true,
  textVersion: consent.textVersion,
  at: ISO(consent.at),
});

const practiceAreaRef = (
  doc: PracticeAreaRefDoc
): { id: string; slug: string; title: string; shortLabel: string } => ({
  id: doc._id.toString(),
  slug: doc.slug,
  title: doc.title,
  shortLabel: doc.shortLabel,
});

const officeRef = (doc: OfficeRefDoc): { id: string; slug: string; name: string } => ({
  id: doc._id.toString(),
  slug: doc.slug,
  name: doc.name,
});

const jobRef = (doc: JobRefDoc): { id: string; title: string } => ({
  id: doc._id.toString(),
  title: doc.title,
});

const actorRef = (doc: UserRefDoc): { id: string; name: string } => ({
  id: doc._id.toString(),
  name: doc.name,
});

/**
 * A populated reference, or null.
 *
 * `populate` leaves an unresolved reference as a bare ObjectId — which happens
 * when a vacancy is deleted while its applications are still within their
 * retention period — so anything without the fields we asked for is treated as
 * absent rather than serialised half-formed.
 */
function refOf<D extends { _id: unknown }, T>(
  value: D | null | undefined,
  shape: (doc: D) => T
): T | null {
  if (value === null || value === undefined) return null;
  if (!('_id' in value)) return null;

  return shape(value);
}

export function toEnquiryAdmin(doc: PopulatedEnquiry): EnquiryAdmin {
  return {
    id: doc._id.toString(),
    reference: doc.reference,
    fullName: doc.fullName,
    email: doc.email,
    phone: doc.phone ?? null,
    organization: doc.organization ?? null,
    practiceArea: refOf(doc.practiceArea, practiceAreaRef),
    preferredOffice: refOf(doc.preferredOffice, officeRef),
    summary: doc.summary,
    consent: consentOf(doc.consent),
    status: doc.status,
    assignedTo: refOf(doc.assignedTo, actorRef),
    createdAt: ISO(doc.createdAt),
  };
}

export function toMessageAdmin(doc: PopulatedMessage): MessageAdmin {
  return {
    id: doc._id.toString(),
    reference: doc.reference,
    fullName: doc.fullName,
    email: doc.email,
    phone: doc.phone ?? null,
    subject: doc.subject ?? null,
    message: doc.message,
    consent: consentOf(doc.consent),
    status: doc.status,
    assignedTo: refOf(doc.assignedTo, actorRef),
    createdAt: ISO(doc.createdAt),
  };
}

export function toApplicationAdmin(doc: PopulatedApplication): ApplicationAdmin {
  return {
    id: doc._id.toString(),
    reference: doc.reference,
    job: refOf(doc.job, jobRef),
    fullName: doc.fullName,
    email: doc.email,
    phone: doc.phone ?? null,
    coverNote: doc.coverNote ?? null,
    cv: {
      // No storageKey: see the note at the top of this file.
      originalName: doc.cv.originalName,
      mimeType: doc.cv.mimeType,
      bytes: doc.cv.bytes,
      scanStatus: doc.cv.scanStatus,
    },
    consent: consentOf(doc.consent),
    status: doc.status,
    createdAt: ISO(doc.createdAt),
  };
}
