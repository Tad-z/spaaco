import type { Types } from 'mongoose';
import type { IMedia } from './media.interface.js';
import type { IPerson, IPersonPublication } from './person.interface.js';
import type { IPracticeArea } from './practice-area.interface.js';
import type { IInsight } from './insight.interface.js';
import type { IOffice } from './office.interface.js';
import type { IJob } from './job.interface.js';
import type { IIndustry } from './industry.interface.js';
import type { IRecognitionDirectory } from './recognition-directory.interface.js';
import type { IAward } from './award.interface.js';
import type { IPage } from './page.interface.js';

/**
 * Documents as they look once their references are populated.
 *
 * These live in `interfaces/` rather than beside a query because both services
 * and serializers need them: a service produces them, a serializer consumes
 * them, and neither layer may import the other.
 */

/** Just enough of a practice area for a chip, a link or a filter option. */
export type IPracticeAreaRefDoc = Pick<IPracticeArea, 'slug' | 'title' | 'shortLabel'> & {
  _id: Types.ObjectId;
};

export type IPracticeAreaWithImage = Omit<IPracticeArea, 'image'> & {
  _id: Types.ObjectId;
  image: IMedia | null;
};

/**
 * A person as every card renders them, front and back: the photo, and the
 * practice-area chips (ADR-052). Drafts are already filtered out of both.
 */
export type IPersonWithPhoto = Omit<IPerson, 'photo' | 'practiceAreas'> & {
  _id: Types.ObjectId;
  photo: IMedia | null;
  practiceAreas: IPracticeAreaRefDoc[];
};

export type IIndustryDoc = IIndustry & { _id: Types.ObjectId };

export type IPracticeAreaDetailDoc = Omit<
  IPracticeArea,
  'image' | 'heroImages' | 'industries' | 'lead'
> & {
  _id: Types.ObjectId;
  image: IMedia | null;
  heroImages: IMedia[];
  industries: IIndustryDoc[];
  lead: IPersonWithPhoto | null;
};

export type IPersonDetailDoc = Omit<
  IPersonWithPhoto,
  'primaryPracticeArea' | 'office' | 'publications'
> & {
  primaryPracticeArea: IPracticeAreaRefDoc | null;
  office: (IOffice & { _id: Types.ObjectId }) | null;
  /** A link to a draft insight populates as null, so the title shows unlinked. */
  publications: (Omit<IPersonPublication, 'insight'> & { insight?: { slug: string } | null })[];
};

export type IInsightDoc = Omit<
  IInsight,
  'coverImage' | 'document' | 'practiceAreas' | 'author' | 'authorPhoto' | 'coAuthors'
> & {
  _id: Types.ObjectId;
  coverImage: IMedia | null;
  /** The named writer's photo (ADR-064). */
  authorPhoto?: IMedia | null;
  /**
   * Populated only on the detail read. A draft attorney's reference populates
   * to null and is dropped by the serializer.
   */
  coAuthors?: { person?: IPersonWithPhoto | null; name?: string | null; photo?: IMedia | null }[];
  /** Populated only on the detail read, where the "Read Article" link needs it. */
  document?: IMedia | null;
  practiceAreas: (IPracticeArea & { _id: Types.ObjectId })[];
  /** Null means the firm is the author, not that the reference is missing. */
  author: IPersonWithPhoto | null;
};

export type IOfficeDoc = IOffice & { _id: Types.ObjectId };

export type IJobDoc = Omit<IJob, 'practiceArea' | 'office'> & {
  _id: Types.ObjectId;
  practiceArea: (IPracticeArea & { _id: Types.ObjectId }) | null;
  office: IOfficeDoc | null;
};

export type IRecognitionDirectoryDoc = Omit<IRecognitionDirectory, 'logo' | 'heroImages'> & {
  _id: Types.ObjectId;
  logo: IMedia | null;
  heroImages: IMedia[];
};

/** A directory as a list shows it: a row on About, a tile in "Recognized By". */
export type IRecognitionDirectoryListDoc = Pick<
  IRecognitionDirectoryDoc,
  '_id' | 'name' | 'slug' | 'logo'
>;

export type IAwardDoc = Omit<IAward, 'badge' | 'directory'> & {
  _id: Types.ObjectId;
  badge: IMedia | null;
  /** Null when the directory is a draft: such an award is dropped, never shown. */
  directory: Pick<IRecognitionDirectory, 'name' | 'slug'> | null;
};

type WithImage<T> = Omit<T, 'image'> & { image?: IMedia | null };
type WithImages<T> = Omit<T, 'images'> & { images?: IMedia[] };

/** A page document with every media and person reference populated. */
export interface IPageDoc extends Omit<
  IPage,
  | 'hero'
  | 'seo'
  | 'videoShowcase'
  | 'recognitionSection'
  | 'whyChooseUs'
  | 'story'
  | 'missionSection'
  | 'principles'
  | 'awardsList'
  | 'csrBanner'
  | 'images'
> {
  _id: Types.ObjectId;
  hero?: WithImages<NonNullable<IPage['hero']>> | null;
  seo: Omit<IPage['seo'], 'ogImage'> & { ogImage?: IMedia | null };
  videoShowcase?:
    (Omit<NonNullable<IPage['videoShowcase']>, 'poster'> & { poster?: IMedia | null }) | null;
  recognitionSection?: WithImage<NonNullable<IPage['recognitionSection']>> | null;
  whyChooseUs?: WithImage<NonNullable<IPage['whyChooseUs']>> | null;
  story?:
    | (Omit<NonNullable<IPage['story']>, 'quotePerson' | 'profileDownload'> & {
        quotePerson?: IPersonWithPhoto | null;
        profileDownload?:
          | (Omit<NonNullable<NonNullable<IPage['story']>['profileDownload']>, 'document'> & {
              document?: IMedia | null;
            })
          | null;
      })
    | null;
  missionSection?: WithImage<NonNullable<IPage['missionSection']>> | null;
  principles?: WithImage<NonNullable<IPage['principles']>> | null;
  awardsList?: WithImage<NonNullable<IPage['awardsList']>> | null;
  csrBanner?: WithImages<NonNullable<IPage['csrBanner']>> | null;
  images?: IMedia[];
}

/**
 * Everything a composed page needs, already loaded.
 *
 * Only the collections a given key renders are populated; the rest are empty,
 * because paying for every collection query to serve the FAQ page would be
 * wasteful on every request.
 */
export interface IPageSources {
  page: IPageDoc;
  practiceAreas: IPracticeAreaWithImage[];
  /** Every published area, for the People and Insights "Practice Area" dropdowns. */
  filterAreas: IPracticeAreaRefDoc[];
  leadership: IPersonWithPhoto[];
  insights: IInsightDoc[];
  /** The awards flagged for Home, in order. */
  awards: IAwardDoc[];
  /** Every published recognition directory, in order: the About awards list. */
  directories: IRecognitionDirectoryListDoc[];
  offices: IOfficeDoc[];
  jobs: IJobDoc[];
  counts: { officeCount: number; practiceAreaCount: number };
}
