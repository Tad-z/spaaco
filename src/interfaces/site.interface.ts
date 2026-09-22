import type { Types } from 'mongoose';
import type { ISettings } from './settings.interface.js';
import type { IGeoPoint } from './office.interface.js';

/**
 * What the site shell needs from the database.
 *
 * Deliberately narrow: `/site` is on the critical path of every page load, so
 * each query projects only the fields the shell renders rather than pulling
 * whole documents.
 */

export interface ISitePracticeArea {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  shortLabel: string;
  showInFooter: boolean;
}

export interface ISiteOffice {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  address: string;
  hours: string;
  phone?: string | null;
  email?: string | null;
  location?: IGeoPoint | null;
  directionsUrl?: string | null;
}

export interface ISiteFaq {
  _id: Types.ObjectId;
  question: string;
  answer: string;
}

export interface ISiteSources {
  settings: ISettings;
  /** Every published area: the nav dropdown lists them all. */
  practiceAreas: ISitePracticeArea[];
  offices: ISiteOffice[];
  faqs: ISiteFaq[];
}
