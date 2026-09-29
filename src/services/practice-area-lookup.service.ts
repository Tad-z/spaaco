import type { Types } from 'mongoose';
import { PracticeArea } from '../models/index.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';

/**
 * The id behind a `?practiceArea=` slug, or null.
 *
 * Published only, like every public read: resolving a draft's slug would let
 * anyone probe whether an unannounced practice area exists and list what is
 * tagged with it. One resolver for the people and insights filters, so the
 * two cannot drift apart. Its own file because the practice-area service
 * already imports the insight service.
 */
export async function findPracticeAreaId(
  slug: string,
  options: PreviewOptions = {}
): Promise<Types.ObjectId | null> {
  const area = await PracticeArea.findOne({ slug, ...publishedFilter(options) })
    .select('_id')
    .lean<{ _id: Types.ObjectId } | null>();

  return area?._id ?? null;
}
