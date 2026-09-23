import type { Types } from 'mongoose';
import { PracticeArea } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { listInsightsByPracticeArea } from './insight.service.js';
import type { InsightDoc } from './insight.service.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type { IPracticeArea } from '../interfaces/practice-area.interface.js';
import type { IMedia } from '../interfaces/media.interface.js';
import type { IPerson } from '../interfaces/person.interface.js';

/** Populated shapes, declared at the call site as the TypeScript rules require. */
export type PracticeAreaWithImage = Omit<IPracticeArea, 'image'> & {
  _id: Types.ObjectId;
  image: IMedia | null;
};

export type PracticeAreaWithContacts = Omit<PracticeAreaWithImage, 'contacts'> & {
  contacts: (Omit<IPerson, 'photo'> & { _id: Types.ObjectId; photo: IMedia | null })[];
};

export async function listPracticeAreas(
  options: PreviewOptions = {}
): Promise<PracticeAreaWithImage[]> {
  return PracticeArea.find(publishedFilter(options))
    .populate('image')
    .sort({ order: 1, title: 1 })
    .lean<PracticeAreaWithImage[]>();
}

/** The Home tab bar has its own order, which differs from the page (ADR-025). */
export async function listFeaturedOnHome(
  options: PreviewOptions = {}
): Promise<PracticeAreaWithImage[]> {
  return PracticeArea.find({ ...publishedFilter(options), featuredOnHome: true })
    .populate('image')
    .sort({ homeOrder: 1, order: 1 })
    .lean<PracticeAreaWithImage[]>();
}

export async function getPracticeAreaBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<{ area: PracticeAreaWithContacts; related: InsightDoc[] }> {
  const area = await PracticeArea.findOne({ slug, ...publishedFilter(options) })
    .populate('image')
    .populate({ path: 'contacts', populate: { path: 'photo' } })
    .lean<PracticeAreaWithContacts | null>();

  if (!area) throw new NotFoundError('Practice area');

  // Loaded here rather than by the controller, so the handler stays one call.
  const related = await listInsightsByPracticeArea(area._id, options);

  return { area, related };
}
