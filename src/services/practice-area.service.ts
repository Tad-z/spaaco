import { PracticeArea } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { listInsightsByPracticeArea } from './insight.service.js';
import type { IInsightDoc } from '../interfaces/populated.interface.js';
import { publishedFilter, publishedPopulate } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type {
  IPracticeAreaWithContacts,
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

export async function getPracticeAreaBySlug(
  slug: string,
  options: PreviewOptions = {}
): Promise<{ area: IPracticeAreaWithContacts; related: IInsightDoc[] }> {
  const area = await PracticeArea.findOne({ slug, ...publishedFilter(options) })
    .populate('image')
    .populate({ ...publishedPopulate('contacts', options), populate: { path: 'photo' } })
    .lean<IPracticeAreaWithContacts | null>();

  if (!area) throw new NotFoundError('Practice area');

  // Loaded here rather than by the controller, so the handler stays one call.
  const related = await listInsightsByPracticeArea(area._id, options);

  return { area, related };
}
