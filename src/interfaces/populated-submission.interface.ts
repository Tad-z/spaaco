import type { Types } from 'mongoose';
import type { IApplication } from './application.interface.js';
import type { IEnquiry } from './enquiry.interface.js';
import type { IMessage } from './message.interface.js';

/**
 * Submissions as they come back from the admin service, with their references
 * populated.
 *
 * Written out rather than left as `Record<string, unknown>` so the serializers
 * type-check against the contract: with the loose shape, adding a required
 * field to `EnquiryAdmin` in the spec produced no error anywhere, which is
 * exactly the compile-time guarantee CLAUDE.md relies on.
 */

export interface PracticeAreaRefDoc {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  shortLabel: string;
}

export interface OfficeRefDoc {
  _id: Types.ObjectId;
  slug: string;
  name: string;
}

export interface JobRefDoc {
  _id: Types.ObjectId;
  title: string;
}

export interface UserRefDoc {
  _id: Types.ObjectId;
  name: string;
}

export type PopulatedEnquiry = Omit<IEnquiry, 'practiceArea' | 'preferredOffice' | 'assignedTo'> & {
  _id: Types.ObjectId;
  practiceArea?: PracticeAreaRefDoc | null;
  preferredOffice?: OfficeRefDoc | null;
  assignedTo?: UserRefDoc | null;
};

export type PopulatedMessage = Omit<IMessage, 'assignedTo'> & {
  _id: Types.ObjectId;
  assignedTo?: UserRefDoc | null;
};

export type PopulatedApplication = Omit<IApplication, 'job'> & {
  _id: Types.ObjectId;
  job?: JobRefDoc | null;
};

/** Whichever of the three a generic helper is holding. */
export type PopulatedSubmission = PopulatedEnquiry | PopulatedMessage | PopulatedApplication;
