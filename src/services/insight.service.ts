import type { Types } from 'mongoose';
import { Insight, PracticeArea } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { publishedFilter, publishedPopulate } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { CONTENT_LIMITS } from '../config/constants.js';
import type { IInsightDoc } from '../interfaces/populated.interface.js';
import type { InsightCategory } from '../types/api.js';

export type { IInsightDoc } from '../interfaces/populated.interface.js';

export interface ListInsightsOptions extends PreviewOptions {
  readonly category?: InsightCategory;
  readonly practiceArea?: string;
  readonly sort: 'newest' | 'oldest';
  readonly page: number;
  readonly pageSize: number;
}

/** What a card renders. Notably not `body`: a card never shows one. */
const CARD_FIELDS =
  'slug title excerpt format videoUrl categories practiceAreas author coverImage featured publishedAt order';

/**
 * Every card renders the cover image, its practice areas and its author.
 *
 * The practice-area and author populates are filtered to published documents.
 * `publishedFilter` constrains only the root query, so without this a
 * published insight would expose a draft attorney or a draft practice area.
 */
function findCards(
  filter: Record<string, unknown>,
  sort: 1 | -1,
  skip: number,
  limit: number,
  options: PreviewOptions = {}
): Promise<IInsightDoc[]> {
  return (
    Insight.find(filter)
      .select(CARD_FIELDS)
      .populate('coverImage')
      .populate(publishedPopulate('practiceAreas', options))
      .populate({ ...publishedPopulate('author', options), populate: { path: 'photo' } })
      // Several insights share a publish month, so the sort needs a tiebreaker or
      // the order varies between identical requests. `order` lets the firm
      // decide; `_id` makes it total.
      .sort({ publishedAt: sort, order: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean<IInsightDoc[]>()
  );
}

async function resolvePracticeAreaId(slug: string): Promise<Types.ObjectId | null> {
  const area = await PracticeArea.findOne({ slug })
    .select('_id')
    .lean<{ _id: Types.ObjectId } | null>();
  return area?._id ?? null;
}

export async function listInsights(
  options: ListInsightsOptions
): Promise<{ items: IInsightDoc[]; total: number }> {
  const filter: Record<string, unknown> = { ...publishedFilter(options) };

  if (options.category !== undefined) filter.categories = options.category;

  if (options.practiceArea !== undefined) {
    const areaId = await resolvePracticeAreaId(options.practiceArea);
    // An unknown practice area is an empty result, not an error: the value
    // comes from a filter tab, and a 404 there would be hostile.
    if (areaId === null) return { items: [], total: 0 };
    filter.practiceAreas = areaId;
  }

  const [items, total] = await Promise.all([
    findCards(
      filter,
      options.sort === 'oldest' ? 1 : -1,
      toSkip(options.page, options.pageSize),
      options.pageSize,
      options
    ),
    Insight.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getInsightBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<{ insight: IInsightDoc; related: IInsightDoc[] }> {
  const insight = await Insight.findOne({ slug, ...publishedFilter(options) })
    .populate('coverImage')
    .populate(publishedPopulate('practiceAreas', options))
    .populate({ ...publishedPopulate('author', options), populate: { path: 'photo' } })
    .lean<IInsightDoc | null>();

  if (!insight) throw new NotFoundError('Insight');

  // Related by shared practice area, falling back to shared category so an
  // insight with no practice area still shows something.
  const relatedFilter: Record<string, unknown> = {
    ...publishedFilter(options),
    _id: { $ne: insight._id },
    ...(insight.practiceAreas.length > 0
      ? { practiceAreas: { $in: insight.practiceAreas.map((area) => area._id) } }
      : { categories: { $in: insight.categories } }),
  };

  const related = await findCards(relatedFilter, -1, 0, CONTENT_LIMITS.relatedInsights, options);

  return { insight, related };
}

export const listLatestInsights = (
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.homeLatestInsights
): Promise<IInsightDoc[]> => findCards(publishedFilter(options), -1, 0, limit, options);

export const listFeaturedInsights = (
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.featuredInsights
): Promise<IInsightDoc[]> =>
  findCards({ ...publishedFilter(options), featured: true }, -1, 0, limit, options);

export const listInsightsByAuthor = (
  authorId: Types.ObjectId,
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.personInsights
): Promise<IInsightDoc[]> =>
  findCards({ ...publishedFilter(options), author: authorId }, -1, 0, limit, options);

export const listInsightsByPracticeArea = (
  practiceAreaId: Types.ObjectId,
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.relatedInsights
): Promise<IInsightDoc[]> =>
  findCards({ ...publishedFilter(options), practiceAreas: practiceAreaId }, -1, 0, limit, options);
