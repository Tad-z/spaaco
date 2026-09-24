import type { Types } from 'mongoose';
import type { IMedia } from './media.interface.js';
import type { IPerson } from './person.interface.js';
import type { IPracticeArea } from './practice-area.interface.js';
import type { IInsight } from './insight.interface.js';
import type { IOffice } from './office.interface.js';
import type { IJob } from './job.interface.js';
import type { IRecognition } from './recognition.interface.js';
import type { IPage } from './page.interface.js';

/**
 * Documents as they look once their references are populated.
 *
 * These live in `interfaces/` rather than beside a query because both services
 * and serializers need them: a service produces them, a serializer consumes
 * them, and neither layer may import the other.
 */

export type IPracticeAreaWithImage = Omit<IPracticeArea, 'image'> & {
  _id: Types.ObjectId;
  image: IMedia | null;
};

export type IPracticeAreaWithContacts = Omit<IPracticeAreaWithImage, 'contacts'> & {
  contacts: IPersonWithPhoto[];
};

export type IPersonWithPhoto = Omit<IPerson, 'photo'> & {
  _id: Types.ObjectId;
  photo: IMedia | null;
};

export type IPersonDetailDoc = Omit<IPerson, 'photo' | 'practiceAreas' | 'office'> & {
  _id: Types.ObjectId;
  photo: IMedia | null;
  practiceAreas: (IPracticeArea & { _id: Types.ObjectId })[];
  office: (IOffice & { _id: Types.ObjectId }) | null;
};

export type IInsightDoc = Omit<IInsight, 'coverImage' | 'practiceAreas' | 'author'> & {
  _id: Types.ObjectId;
  coverImage: IMedia | null;
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

export type IRecognitionWithBadge = Omit<IRecognition, 'badge'> & {
  _id: Types.ObjectId;
  badge: IMedia | null;
};

type WithImage<T> = Omit<T, 'image'> & { image?: IMedia | null };

/** A page document with every media and person reference populated. */
export interface IPageDoc extends Omit<
  IPage,
  | 'hero'
  | 'seo'
  | 'videoShowcase'
  | 'whyChooseUs'
  | 'story'
  | 'missionSection'
  | 'principles'
  | 'awardsList'
  | 'csrBanner'
> {
  _id: Types.ObjectId;
  hero?: (Omit<NonNullable<IPage['hero']>, 'image'> & { image?: IMedia | null }) | null;
  seo: Omit<IPage['seo'], 'ogImage'> & { ogImage?: IMedia | null };
  videoShowcase?:
    (Omit<NonNullable<IPage['videoShowcase']>, 'poster'> & { poster?: IMedia | null }) | null;
  whyChooseUs?: WithImage<NonNullable<IPage['whyChooseUs']>> | null;
  story?:
    | (Omit<NonNullable<IPage['story']>, 'quotePerson'> & {
        quotePerson?: IPersonWithPhoto | null;
      })
    | null;
  missionSection?: WithImage<NonNullable<IPage['missionSection']>> | null;
  principles?: WithImage<NonNullable<IPage['principles']>> | null;
  awardsList?: WithImage<NonNullable<IPage['awardsList']>> | null;
  csrBanner?: WithImage<NonNullable<IPage['csrBanner']>> | null;
}

/**
 * Everything a composed page needs, already loaded.
 *
 * Only the collections a given key renders are populated; the rest are empty,
 * because paying for eight collection queries to serve the FAQ page would be
 * wasteful on every request.
 */
export interface IPageSources {
  page: IPageDoc;
  practiceAreas: IPracticeAreaWithImage[];
  leadership: IPersonWithPhoto[];
  insights: IInsightDoc[];
  recognitions: IRecognitionWithBadge[];
  offices: IOfficeDoc[];
  jobs: IJobDoc[];
  counts: { officeCount: number; practiceAreaCount: number };
}
