import type { Types } from 'mongoose';
import type {
  IHero,
  IIconItem,
  ILink,
  IPendingLink,
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
  caption?: string | null;
}

/** The Home Recognition band. Its badges are the awards flagged for Home. */
export interface IHomeRecognitionSection {
  eyebrow?: string | null;
  title: string;
  image?: Types.ObjectId | null;
  cta: IPendingLink;
}

export interface IHomeWhyChooseUs {
  eyebrow?: string | null;
  title: string;
  text: string;
  points: IIconItem[];
  image?: Types.ObjectId | null;
}

/** "…download a copy of our profile here", where `linkLabel` is the linked word. */
export interface IAboutProfileDownload {
  leadText: string;
  linkLabel: string;
  /** A media record of `kind: document`. */
  document?: Types.ObjectId | null;
}

export interface IAboutStory {
  eyebrow?: string | null;
  title: string;
  paragraphs: string[];
  quote?: string | null;
  quotePerson?: Types.ObjectId | null;
  profileDownload?: IAboutProfileDownload | null;
}

export interface IAboutStats {
  title: string;
  items: IStat[];
}

export interface IAboutMissionSection {
  eyebrow?: string | null;
  title: string;
  image?: Types.ObjectId | null;
  /** Bodies are sanitised HTML. */
  items: ITitledBody[];
}

export interface IAboutPrinciples {
  eyebrow?: string | null;
  title: string;
  image?: Types.ObjectId | null;
  items: IIconItem[];
}

/** The rows are the recognition directories, not stored here. */
export interface IAboutAwardsList {
  eyebrow?: string | null;
  title: string;
  image?: Types.ObjectId | null;
}

export interface ICsrBanner {
  title: string;
  text: string;
  images: Types.ObjectId[];
  cta?: ILink | null;
}

/** Shown in place of the job cards when nothing is open. */
export interface ICareersEmptyState {
  title: string;
  /** Sanitised HTML. */
  body: string;
  ctaLabel: string;
}

export interface ICareersJobsSection {
  eyebrow?: string | null;
  title: string;
  cta?: ILink | null;
  emptyState?: ICareersEmptyState | null;
}

/** What every recognition directory page shares. */
export interface IRecognitionDirectoryLabels {
  awardsEyebrow: string;
  primaryCta?: ILink | null;
  secondaryCta?: ILink | null;
}

/**
 * One stored page. Every section is optional at the Mongoose level because the
 * set differs by key; the per-key Zod schema decides which are required.
 */
export interface IPage {
  key: PageKey;
  /** Null on the pages that open without a banner: insights, recognition, responsible-business. */
  hero?: IHero | null;
  seo: ISeo;

  // home
  aboutFirm?: IHomeAboutFirm | null;
  videoShowcase?: IHomeVideoShowcase | null;
  recognitionSection?: IHomeRecognitionSection | null;
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
  jobsSection?: ICareersJobsSection | null;

  // recognition
  directoryPage?: IRecognitionDirectoryLabels | null;

  // responsible-business
  title?: string | null;
  images?: Types.ObjectId[];
  backLink?: ILink | null;

  /** Optimistic-locking counter (ADR-015). */
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
