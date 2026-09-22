import type { Types } from 'mongoose';
import type { IContentFields } from './common.interface.js';
import type { PersonRole } from '../types/api.js';

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
  /** Stored but never returned publicly, pending the firm's decision (Q9). */
  email?: string | null;
  bio?: string | null;
  /** Only used for the Managing Partner's pull quote on the About page. */
  quote?: string | null;
  practiceAreas: Types.ObjectId[];
  office?: Types.ObjectId | null;
  featuredInLeadership: boolean;
}
