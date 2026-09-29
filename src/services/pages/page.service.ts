import { Office, Page, PracticeArea } from '../../models/index.js';
import { NotFoundError } from '../../core/errors.js';
import {
  personCardFields,
  publishedFilter,
  publishedPopulate,
} from '../../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../../helpers/published-filter.helper.js';
import type { PageKey } from '../../types/api.js';
import {
  listFeaturedOnHome,
  listPracticeAreaLinks,
  listPracticeAreas,
} from '../practice-area.service.js';
import { listLeadership } from '../person.service.js';
import { listFeaturedInsights, listLatestInsights } from '../insight.service.js';
import { listOffices } from '../office.service.js';
import { listJobs } from '../job.service.js';
import { listDirectories, listFeaturedAwards } from '../recognition.service.js';
import type {
  IAwardDoc,
  IInsightDoc,
  IJobDoc,
  IOfficeDoc,
  IPageDoc,
  IPageSources,
  IPersonWithPhoto,
  IPracticeAreaRefDoc,
  IPracticeAreaWithImage,
  IRecognitionDirectoryDoc,
} from '../../interfaces/populated.interface.js';

/**
 * Composes a page: the stored document plus every collection it embeds, so the
 * frontend renders a page from one request.
 *
 * The composers themselves live in `serializers/pages.serializer.ts`; this
 * only fetches.
 */

/** Every media reference a page document can hold, single or array. */
const POPULATE_PATHS = [
  'hero.images',
  'seo.ogImage',
  'videoShowcase.poster',
  'recognitionSection.image',
  'whyChooseUs.image',
  'story.profileDownload.document',
  'missionSection.image',
  'principles.image',
  'awardsList.image',
  'csrBanner.images',
  'images',
] as const;

const none = <T>(): Promise<T[]> => Promise.resolve([]);

/**
 * Load only what the key renders.
 *
 * The FAQ page needs nothing beyond its own document, and paying for every
 * collection query to serve it would be wasteful on every request.
 */
async function loadFor(
  key: PageKey,
  page: IPageDoc,
  options: PreviewOptions
): Promise<IPageSources> {
  const needsCounts = key === 'about';

  const [
    practiceAreas,
    filterAreas,
    leadership,
    insights,
    awards,
    directories,
    offices,
    jobs,
    officeCount,
    practiceAreaCount,
  ] = await Promise.all([
    key === 'home'
      ? listFeaturedOnHome(options)
      : key === 'practice-areas'
        ? listPracticeAreas(options)
        : none<IPracticeAreaWithImage>(),
    key === 'people' || key === 'insights'
      ? listPracticeAreaLinks(options)
      : none<IPracticeAreaRefDoc>(),
    key === 'home' ? listLeadership(options) : none<IPersonWithPhoto>(),
    key === 'home'
      ? listLatestInsights(options)
      : key === 'insights'
        ? listFeaturedInsights(options)
        : none<IInsightDoc>(),
    key === 'home' ? listFeaturedAwards(options) : none<IAwardDoc>(),
    key === 'about' ? listDirectories(options) : none<IRecognitionDirectoryDoc>(),
    key === 'offices' ? listOffices(options) : none<IOfficeDoc>(),
    key === 'careers' ? listJobs(options) : none<IJobDoc>(),
    needsCounts ? Office.countDocuments(publishedFilter(options)) : Promise.resolve(0),
    needsCounts ? PracticeArea.countDocuments(publishedFilter(options)) : Promise.resolve(0),
  ]);

  return {
    page,
    practiceAreas,
    filterAreas,
    leadership,
    insights,
    awards,
    directories,
    offices,
    jobs,
    counts: { officeCount, practiceAreaCount },
  };
}

/** The stored page with its media and quoted person populated. */
export async function findPageDoc(key: PageKey, options: PreviewOptions = {}): Promise<IPageDoc> {
  let query = Page.findOne({ key });

  for (const path of POPULATE_PATHS) query = query.populate(path);
  query = query.populate({
    ...publishedPopulate('story.quotePerson', options),
    populate: personCardFields(options),
  });

  const page = await query.lean<IPageDoc | null>();
  if (!page) throw new NotFoundError('Page');

  return page;
}

export async function getPageSources(
  key: PageKey,
  options: PreviewOptions = {}
): Promise<IPageSources> {
  // A page document has no status of its own: it exists or it does not. What
  // `preview` governs is the collections it embeds.
  return loadFor(key, await findPageDoc(key, options), options);
}
