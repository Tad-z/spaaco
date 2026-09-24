import type { Types } from 'mongoose';
import type { SubmissionStatus } from '../types/api.js';

/**
 * Consent as it stood when the form was sent (NDPA 2023).
 *
 * The wording version is stored, not just the boolean: proving consent means
 * proving what was consented to, and the text changes over time.
 */
export interface IConsent {
  given: true;
  textVersion: string;
  at: Date;
}

/** A "Discuss a Mandate" enquiry. Personal data throughout. */
export interface IEnquiry {
  reference: string;
  fullName: string;
  organization?: string | null;
  email: string;
  phone?: string | null;
  practiceArea?: Types.ObjectId | null;
  preferredOffice?: Types.ObjectId | null;
  summary: string;
  consent: IConsent;
  status: SubmissionStatus;
  assignedTo?: Types.ObjectId | null;
  /** Salted SHA-256 of the sender's address. The address itself is never kept. */
  ipHash: string;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
