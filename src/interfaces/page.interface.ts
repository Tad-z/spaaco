import type { Types } from 'mongoose';
import type {
  IHero,
  IIconItem,
  ILink,
  ISectionHeader,
  ISeo,
  IStat,
  ITitledBody,
} from './common.interface.js';
import type { PageKey } from '../types/api.js';

/**
 * Page documents: one per key, each with its own fixed set of sections.
 *
 * Not a block builder (ADR-004). The designs are settled, so every section is
 * declared and validated, and editors change content rather than layout. The
 * per-key Zod schemas in `validators/pages/` are what enforce which sections a
 * given key may carry.
 */

export interface IHomeAboutFirm {
  title: string;
  paragraphs: string[];
  cta?: ILink | null;
}

export interface IHomeVideoShowcase {
  videoUrl?: string | null;
  poster?: Types.ObjectId | null;
}

export interface IHomeRecognitionTabs {
  achievementsLabel: string;
  recognizedByLabel: string;
}

export interface IHomeWhyChooseUs {
  eyebrow?: string | null;
  title: string;
  text: string;
  points: IIconItem[];
  image?: Types.ObjectId | null;
}

export interface IAboutStory {
  eyebrow?: string | null;
  title: string;
  paragraphs: string[];
  quote?: string | null;
  quotePerson?: Types.ObjectId | null;
}

export interface IAboutStats {
  title: string;
  items: IStat[];
}

export interface IAboutMissionSection {
  eyebrow?: string | null;
  title: string;
  image?: Types.ObjectId | null;
  items: ITitledBody[];
}

export interface IAboutPrinciples {
  eyebrow?: string | null;
  title: string;
  image?: Types.ObjectId | null;
  items: IIconItem[];
}

export interface IAwardListItem {
  name: string;
  url?: string | null;
}

export interface IAboutAwardsList {
  eyebrow?: string | null;
  title: string;
  image?: Types.ObjectId | null;
  items: IAwardListItem[];
}

export interface ICsrBanner {
  title: string;
  text: string;
  image?: Types.ObjectId | null;
  cta?: ILink | null;
}

/**
 * One stored page. Every section is optional at the Mongoose level because the
 * set differs by key; the per-key Zod schema decides which are required.
 */
export interface IPage {
  key: PageKey;
  /** Null on the insights page, which opens with the featured carousel. */
  hero?: IHero | null;
  seo: ISeo;

  // home
  aboutFirm?: IHomeAboutFirm | null;
  videoShowcase?: IHomeVideoShowcase | null;
  recognitionTabs?: IHomeRecognitionTabs | null;
  practiceSection?: ISectionHeader | null;
  leadershipSection?: ISectionHeader | null;
  whyChooseUs?: IHomeWhyChooseUs | null;
  insightsSection?: ISectionHeader | null;

  // about
  story?: IAboutStory | null;
  stats?: IAboutStats | null;
  missionSection?: IAboutMissionSection | null;
  principles?: IAboutPrinciples | null;
  awardsList?: IAboutAwardsList | null;

  // practice-areas
  gridSection?: ISectionHeader | null;
  csrBanner?: ICsrBanner | null;

  // people, insights, careers
  directorySection?: ISectionHeader | null;
  listingSection?: ISectionHeader | null;
  jobsSection?: ISectionHeader | null;

  /** Optimistic-locking counter (ADR-015). */
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
