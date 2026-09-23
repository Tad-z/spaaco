import { Insight, Person, PracticeArea } from '../models/index.js';
import { SEARCH } from '../config/constants.js';
import { publishedFilter, publishedPopulate } from '../helpers/published-filter.helper.js';
import type {
  IInsightDoc,
  IPersonWithPhoto,
  IPracticeAreaWithImage,
} from '../interfaces/populated.interface.js';

/**
 * Header search across the three collections a visitor is likely to be looking
 * for.
 *
 * Published only, with no preview mode: search is a public discovery surface,
 * and quietly surfacing drafts to an authenticated admin browsing the live site
 * is a worse failure than not previewing at all.
 *
 * Results are ranked by Mongo text score, so a title match outranks a passing
 * mention in a body.
 */

export interface SearchResultSources {
  practiceAreas: IPracticeAreaWithImage[];
  people: IPersonWithPhoto[];
  insights: IInsightDoc[];
}

/** One definition of published, shared with every other read. */
const PUBLISHED = publishedFilter();

const byScore = { score: { $meta: 'textScore' } } as const;
const scoreProjection = { score: { $meta: 'textScore' } } as const;

export async function search(query: string): Promise<SearchResultSources> {
  const text = { $text: { $search: query } };
  const limit = SEARCH.resultsPerGroup;

  const [practiceAreas, people, insights] = await Promise.all([
    PracticeArea.find({ ...PUBLISHED, ...text }, scoreProjection)
      .populate('image')
      .sort(byScore)
      .limit(limit)
      .lean<IPracticeAreaWithImage[]>(),
    Person.find({ ...PUBLISHED, ...text }, scoreProjection)
      .populate('photo')
      .sort(byScore)
      .limit(limit)
      .lean<IPersonWithPhoto[]>(),
    Insight.find({ ...PUBLISHED, ...text }, scoreProjection)
      .populate('coverImage')
      .populate(publishedPopulate('practiceAreas'))
      .populate({ ...publishedPopulate('author'), populate: { path: 'photo' } })
      .sort(byScore)
      .limit(limit)
      .lean<IInsightDoc[]>(),
  ]);

  return { practiceAreas, people, insights };
}
