import type { Types } from 'mongoose';
import type { IContentFields, ILegacyImport } from './common.interface.js';
import type { PersonRole } from '../types/api.js';

/** One line in a profile's Education list. */
export interface IEducationEntry {
  qualification: string;
  year?: number | null;
}

export interface IEducation {
  intro?: string | null;
  entries: IEducationEntry[];
}

/**
 * An attorney.
 *
 * `displayName` and `roleLabel` are deliberately not stored: serializers derive
 * them, so a label change never needs a data migration.
 */
export interface IPerson extends IContentFields {
  honorific?: string | null;
  firstName: string;
  lastName: string;
  postNominals?: string | null;
  role: PersonRole;
  photo?: Types.ObjectId | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  /** Public: shown on the profile and the practice-lead card (ADR-052). */
  email?: string | null;
  /** The short italic line on the back of the card. */
  cardBio?: string | null;
  /** Sanitised HTML, two or more paragraphs. */
  bio?: string | null;
  /** Only used for the Managing Partner's pull quote on the About page. */
  quote?: string | null;
  /** Shown under the portrait on the profile. */
  primaryPracticeArea?: Types.ObjectId | null;
  /** The card-back chips. */
  practiceAreas: Types.ObjectId[];
  education: IEducation;
  memberships: string[];
  office?: Types.ObjectId | null;
  featuredInLeadership: boolean;
  /** Set when the record came from a content import (ADR-059). */
  legacy?: ILegacyImport | null;
}
