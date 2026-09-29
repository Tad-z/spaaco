import { PracticeArea } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { listInsightsByPracticeArea } from './insight.service.js';
import {
  personCardPopulate,
  publishedFilter,
  publishedPopulate,
} from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type {
  IInsightDoc,
  IPracticeAreaDetailDoc,
  IPracticeAreaRefDoc,
  IPracticeAreaWithImage,
} from '../interfaces/populated.interface.js';

export async function listPracticeAreas(
  options: PreviewOptions = {}
): Promise<IPracticeAreaWithImage[]> {
  return PracticeArea.find(publishedFilter(options))
    .populate('image')
    .sort({ order: 1, title: 1 })
    .lean<IPracticeAreaWithImage[]>();
}

/** The Home tab bar has its own order, which differs from the page (ADR-025). */
export async function listFeaturedOnHome(
  options: PreviewOptions = {}
): Promise<IPracticeAreaWithImage[]> {
  return PracticeArea.find({ ...publishedFilter(options), featuredOnHome: true })
    .populate('image')
    .sort({ homeOrder: 1, order: 1 })
    .lean<IPracticeAreaWithImage[]>();
}

/**
 * Every published area, as little as a link needs: the detail page's sidebar
 * and the People and Insights "Practice Area" dropdowns (ADR-054).
 */
export async function listPracticeAreaLinks(
  options: PreviewOptions = {}
): Promise<IPracticeAreaRefDoc[]> {
  return PracticeArea.find(publishedFilter(options))
    .select('slug title shortLabel')
    .sort({ order: 1, title: 1 })
    .lean<IPracticeAreaRefDoc[]>();
}

export interface PracticeAreaDetailSources {
  readonly area: IPracticeAreaDetailDoc;
  readonly siblings: IPracticeAreaRefDoc[];
  readonly publications: IInsightDoc[];
}

/**
 * The detail page: the area with its hero slides, industries and lead, plus
 * the sidebar and the recent publications.
 *
 * The lead and the industries go through `publishedPopulate`, so a draft
 * attorney or a draft industry drops out rather than leaking (ADR-031).
 */
export async function getPracticeAreaBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<PracticeAreaDetailSources> {
  const area = await PracticeArea.findOne({ slug, ...publishedFilter(options) })
    .populate('image')
    .populate('heroImages')
    .populate({ ...publishedPopulate('industries', options), select: 'name slug' })
    .populate(personCardPopulate('lead', options))
    .lean<IPracticeAreaDetailDoc | null>();

  if (!area) throw new NotFoundError('Practice area');

  // Loaded here rather than by the controller, so the handler stays one call.
  const [siblings, publications] = await Promise.all([
    listPracticeAreaLinks(options),
    listInsightsByPracticeArea(area._id, options),
  ]);

  return { area, siblings, publications };
}
