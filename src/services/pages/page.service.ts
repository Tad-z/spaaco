import { Page } from '../../models/index.js';
import { NotFoundError } from '../../core/errors.js';
import { publishedFilter } from '../../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../../helpers/published-filter.helper.js';
import type { PageKey } from '../../types/api.js';
import { listFeaturedOnHome, listPracticeAreas } from '../practice-area.service.js';
import { listLeadership } from '../person.service.js';
import { listFeaturedInsights, listLatestInsights } from '../insight.service.js';
import { listOffices } from '../office.service.js';
import { listJobs } from '../job.service.js';
import { Office, PracticeArea, Recognition } from '../../models/index.js';
import type {
  IInsightDoc,
  IJobDoc,
  IOfficeDoc,
  IPageDoc,
  IPageSources,
  IPersonWithPhoto,
  IPracticeAreaWithImage,
  IRecognitionWithBadge,
} from '../../interfaces/populated.interface.js';

/**
 * Composes a page: the stored document plus every collection it embeds, so the
 * frontend renders a page from one request.
 *
 * Each key has its own composer. They live in separate files because a single
 * switch covering eight pages would be the largest and least readable function
 * in the codebase.
 */

/** Every media/person reference a page document can hold. */
const POPULATE_PATHS = [
  'hero.image',
  'seo.ogImage',
  'videoShowcase.poster',
  'whyChooseUs.image',
  'missionSection.image',
  'principles.image',
  'awardsList.image',
  'csrBanner.image',
] as const;

const none = <T>(): Promise<T[]> => Promise.resolve([]);

/**
 * Load only what the key renders.
 *
 * The FAQ page needs nothing beyond its own document, and paying for eight
 * collection queries to serve it would be wasteful on every request.
 */
async function loadFor(key: PageKey, page: IPageDoc, options: PreviewOptions): Promise<IPageSources> {
  const needsCounts = key === 'about';

  const [practiceAreas, leadership, insights, recognitions, offices, jobs, officeCount, practiceAreaCount] =
    await Promise.all([
      key === 'home'
        ? listFeaturedOnHome(options)
        : key === 'practice-areas'
          ? listPracticeAreas(options)
          : none<IPracticeAreaWithImage>(),
      key === 'home' ? listLeadership(options) : none<IPersonWithPhoto>(),
      key === 'home'
        ? listLatestInsights(options)
        : key === 'insights'
          ? listFeaturedInsights(options)
          : none<IInsightDoc>(),
      key === 'home'
        ? Recognition.find(publishedFilter(options))
            .populate('badge')
            .sort({ order: 1 })
            .lean<IRecognitionWithBadge[]>()
        : none<IRecognitionWithBadge>(),
      key === 'offices' ? listOffices(options) : none<IOfficeDoc>(),
      key === 'careers' ? listJobs(options) : none<IJobDoc>(),
      needsCounts ? Office.countDocuments(publishedFilter(options)) : Promise.resolve(0),
      needsCounts ? PracticeArea.countDocuments(publishedFilter(options)) : Promise.resolve(0),
    ]);

  return {
    page,
    practiceAreas,
    leadership,
    insights,
    recognitions,
    offices,
    jobs,
    counts: { officeCount, practiceAreaCount },
  };
}

export async function getPageSources(
  key: PageKey,
  options: PreviewOptions = {}
): Promise<IPageSources> {
  let query = Page.findOne({ key });

  for (const path of POPULATE_PATHS) query = query.populate(path);
  query = query.populate({ path: 'story.quotePerson', populate: { path: 'photo' } });

  const page = await query.lean<IPageDoc | null>();
  if (!page) throw new NotFoundError('Page');

  // A page document has no status of its own: it exists or it does not. What
  // `preview` governs is the collections it embeds.
  return loadFor(key, page, options);
}
