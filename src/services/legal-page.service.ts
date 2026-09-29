import { LegalPage } from '../models/index.js';
import { NotFoundError } from '../core/errors.js';
import { publishedFilter } from '../helpers/published-filter.helper.js';
import type { PreviewOptions } from '../helpers/published-filter.helper.js';
import type { ILegalPage } from '../interfaces/legal-page.interface.js';

/**
 * A legal page, published only (ADR-057).
 *
 * Any key that names no page — including one outside `terms` and `privacy` —
 * is a 404: the route takes any slug, so the answer to an unknown one is "not
 * here", not "malformed".
 */
export async function getLegalPage(key: string, options: PreviewOptions = {}): Promise<ILegalPage> {
  const page = await LegalPage.findOne({
    key,
    ...publishedFilter(options),
  }).lean<ILegalPage | null>();
  if (!page) throw new NotFoundError('Legal page');

  return page;
}
