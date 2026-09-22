import { Faq, Office, PracticeArea, Settings } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type {
  ISiteFaq,
  ISiteOffice,
  ISitePracticeArea,
  ISiteSources,
} from '../interfaces/site.interface.js';
import type { ISettings } from '../interfaces/settings.interface.js';

/**
 * Loads everything the global shell needs.
 *
 * The four queries are independent, so they run in parallel: this endpoint is
 * on the critical path of every page load. Each projects only the fields the
 * shell actually renders.
 */
export async function getSite(options: PreviewOptions = {}): Promise<ISiteSources> {
  const filter = publishedFilter(options);

  const [settings, practiceAreas, offices, faqs] = await Promise.all([
    Settings.findOne({ key: 'site' }).lean<ISettings | null>(),
    PracticeArea.find(filter)
      .select('slug title shortLabel showInFooter')
      .sort({ order: 1, title: 1 })
      .lean<ISitePracticeArea[]>(),
    Office.find(filter)
      .select('slug name address hours phone email location directionsUrl')
      .sort({ order: 1, name: 1 })
      .lean<ISiteOffice[]>(),
    Faq.find(filter).select('question answer').sort({ order: 1 }).lean<ISiteFaq[]>(),
  ]);

  if (!settings) {
    // An unseeded database rather than a client error, but "there is no site
    // configuration" is honestly a 404.
    throw new NotFoundError('Site settings');
  }

  return { settings, practiceAreas, offices, faqs };
}
