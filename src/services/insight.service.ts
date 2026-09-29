import type { Types } from 'mongoose';
import { Insight } from '../models/index.js';
import { findPracticeAreaId } from './practice-area-lookup.service.js';
import { NotFoundError } from '../core/errors.js';
import {
  personCardPopulate,
  publishedFilter,
  publishedPopulate,
} from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import { toSkip } from '../helpers/pagination.helper.js';
import { CONTENT_LIMITS } from '../config/constants.js';
import { EXCLUDED_FROM_MAIN_LISTING } from '../constants/enums.js';
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
 * The condition every listing applies unless it asks for an excluded category
 * by name: pro bono stories appear only on the Responsible Business grid
 * (ADR-049).
 *
 * An insight tagged `pro_bono` *and* something else is still a pro bono
 * story, so it is excluded from the other category too — the designs show no
 * pro bono card anywhere but that grid.
 */
export function mainListingFilter(category?: InsightCategory): Record<string, unknown> {
  if (category !== undefined && EXCLUDED_FROM_MAIN_LISTING.includes(category)) {
    return { categories: category };
  }

  const excluded = { $nin: [...EXCLUDED_FROM_MAIN_LISTING] };
  return category === undefined
    ? { categories: excluded }
    : { $and: [{ categories: category }, { categories: excluded }] };
}

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
      .populate(personCardPopulate('author', options))
      // Several insights share a publish month, so the sort needs a tiebreaker or
      // the order varies between identical requests. `order` lets the firm
      // decide; `_id` makes it total.
      .sort({ publishedAt: sort, order: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean<IInsightDoc[]>()
  );
}

export async function listInsights(
  options: ListInsightsOptions
): Promise<{ items: IInsightDoc[]; total: number }> {
  const filter: Record<string, unknown> = {
    ...publishedFilter(options),
    ...mainListingFilter(options.category),
  };

  if (options.practiceArea !== undefined) {
    const areaId = await findPracticeAreaId(options.practiceArea, options);
    // An unknown practice area is an empty result, not an error: the value
    // comes from a filter control, and a 404 there would be hostile.
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
    // The "Read Article" link, when it points at an uploaded PDF (ADR-051).
    .populate('document')
    .populate(publishedPopulate('practiceAreas', options))
    .populate(personCardPopulate('author', options))
    .lean<IInsightDoc | null>();

  if (!insight) throw new NotFoundError('Insight');

  // A pro bono story's neighbours are other pro bono stories; everything
  // else never shows one (ADR-049).
  const proBono = insight.categories.some((category) =>
    EXCLUDED_FROM_MAIN_LISTING.includes(category)
  );

  // Related by shared practice area, falling back to shared category so an
  // insight with no practice area still shows something.
  const relatedFilter: Record<string, unknown> = {
    ...publishedFilter(options),
    _id: { $ne: insight._id },
    ...(proBono
      ? { categories: { $in: [...EXCLUDED_FROM_MAIN_LISTING] } }
      : {
          $and: [
            mainListingFilter(),
            insight.practiceAreas.length > 0
              ? { practiceAreas: { $in: insight.practiceAreas.map((area) => area._id) } }
              : { categories: { $in: insight.categories } },
          ],
        }),
  };

  const related = await findCards(relatedFilter, -1, 0, CONTENT_LIMITS.relatedInsights, options);

  return { insight, related };
}

export const listLatestInsights = (
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.homeLatestInsights
): Promise<IInsightDoc[]> =>
  findCards({ ...publishedFilter(options), ...mainListingFilter() }, -1, 0, limit, options);

export const listFeaturedInsights = (
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.featuredInsights
): Promise<IInsightDoc[]> =>
  findCards(
    { ...publishedFilter(options), ...mainListingFilter(), featured: true },
    -1,
    0,
    limit,
    options
  );

/** An attorney's "Recent Publications": never a pro bono story. */
export const listInsightsByAuthor = (
  authorId: Types.ObjectId,
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.recentPublications
): Promise<IInsightDoc[]> =>
  findCards(
    { ...publishedFilter(options), ...mainListingFilter(), author: authorId },
    -1,
    0,
    limit,
    options
  );

/** A practice area's "Recent Publications": never a pro bono story. */
export const listInsightsByPracticeArea = (
  practiceAreaId: Types.ObjectId,
  options: PreviewOptions = {},
  limit: number = CONTENT_LIMITS.recentPublications
): Promise<IInsightDoc[]> =>
  findCards(
    { ...publishedFilter(options), ...mainListingFilter(), practiceAreas: practiceAreaId },
    -1,
    0,
    limit,
    options
  );
