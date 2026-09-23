import type { Types } from 'mongoose';
import { Insight, PracticeArea } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { CONTENT_LIMITS } from '../config/constants.js';
import type { IInsight } from '../interfaces/insight.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import type { IPracticeArea } from '../interfaces/practice-area.interface.js';
import type { IPerson } from '../interfaces/person.interface.js';
import type { InsightCategory } from '../types/api.js';

export type InsightDoc = Omit<IInsight, 'coverImage' | 'practiceAreas' | 'author'> & {
  _id: Types.ObjectId;
  coverImage: IMedia | null;
  practiceAreas: (IPracticeArea & { _id: Types.ObjectId })[];
  author: (Omit<IPerson, 'photo'> & { _id: Types.ObjectId; photo: IMedia | null }) | null;
};

export interface ListInsightsOptions extends PreviewOptions {
  readonly category?: InsightCategory;
  readonly practiceArea?: string;
  readonly sort: 'newest' | 'oldest';
  readonly page: number;
  readonly pageSize: number;
}

/** Every card renders the cover image, its practice areas and its author. */
function findCards(
  filter: Record<string, unknown>,
  sort: 1 | -1,
  skip: number,
  limit: number
): Promise<InsightDoc[]> {
  return Insight.find(filter)
    .populate('coverImage')
    .populate('practiceAreas')
    .populate({ path: 'author', populate: { path: 'photo' } })
    // Several insights share a publish month, so the sort needs a tiebreaker
    // or the order varies between identical requests. `order` lets the firm
    // decide; `_id` makes it total.
    .sort({ publishedAt: sort, order: 1, _id: 1 })
    .skip(skip)
    .limit(limit)
    .lean<InsightDoc[]>();
}

async function resolvePracticeAreaId(slug: string): Promise<Types.ObjectId | null> {
  const area = await PracticeArea.findOne({ slug })
    .select('_id')
    .lean<{ _id: Types.ObjectId } | null>();
  return area?._id ?? null;
}

export async function listInsights(
  options: ListInsightsOptions
): Promise<{ items: InsightDoc[]; total: number }> {
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
      options.pageSize
    ),
    Insight.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getInsightBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<{ insight: InsightDoc; related: InsightDoc[] }> {
  const insight = await Insight.findOne({ slug, ...publishedFilter(options) })
    .populate('coverImage')
    .populate('practiceAreas')
    .populate({ path: 'author', populate: { path: 'photo' } })
    .lean<InsightDoc | null>();

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

  const related = await findCards(relatedFilter, -1, 0, CONTENT_LIMITS.relatedInsights);

  return { insight, related };
}

export const listLatestInsights = (
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.homeLatestInsights
): Promise<InsightDoc[]> => findCards(publishedFilter(options), -1, 0, limit);

export const listFeaturedInsights = (
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.featuredInsights
): Promise<InsightDoc[]> =>
  findCards({ ...publishedFilter(options), featured: true }, -1, 0, limit);

export const listInsightsByAuthor = (
  authorId: Types.ObjectId,
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.personInsights
): Promise<InsightDoc[]> =>
  findCards({ ...publishedFilter(options), author: authorId }, -1, 0, limit);

export const listInsightsByPracticeArea = (
  practiceAreaId: Types.ObjectId,
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.relatedInsights
): Promise<InsightDoc[]> =>
  findCards({ ...publishedFilter(options), practiceAreas: practiceAreaId }, -1, 0, limit);

export const listInsightsByIds = (
  ids: Types.ObjectId[],
  options: PreviewOptions = {}
): Promise<InsightDoc[]> =>
  ids.length === 0
    ? Promise.resolve([])
    : findCards({ ...publishedFilter(options), _id: { $in: ids } }, -1, 0, ids.length);
